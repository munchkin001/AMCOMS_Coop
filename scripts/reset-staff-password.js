import { createClient } from '@supabase/supabase-js';
import { stdin, stdout } from 'node:process';

const staffAccounts = [
  { email: 'chairman@amcoms.com', name: 'Carlito Labial' },
  { email: 'manager@amcoms.com', name: 'Isabelita Labial' },
  { email: 'treasurer@amcoms.com', name: 'Eulalia Andoy' },
  { email: 'bookkeeper@amcoms.com', name: 'Joan Mae Madrazo (Bookkeeper)' },
  { email: 'inventory@amcoms.com', name: 'Joan Mae Madrazo (Inventory)' },
];

function prompt(label, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdin.setRawMode) {
      reject(new Error('Run this script in an interactive VS Code or PowerShell terminal.'));
      return;
    }

    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
    };
    const onData = (chunk) => {
  // Ignore arrow keys and other terminal escape sequences.
  if (chunk.includes('\u001b')) return;

  for (const character of chunk) {
    if (character === '\u0003') {
      cleanup();
      reject(new Error('Cancelled.'));
      return;
    }

    if (character === '\r' || character === '\n') {
      cleanup();
      resolve(value);
      return;
    }

    if (character === '\u007f' || character === '\b') {
      if (value.length) {
        value = value.slice(0, -1);
        if (!hidden) stdout.write('\b \b');
      }
      continue;
    }

    // Accept ordinary printable characters only.
    if (character >= ' ' && character <= '~') {
      value += character;
      if (!hidden) stdout.write(character);
    }
  }
};

    stdin.on('data', onData);
  });
}

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list Auth accounts: ${error.message}`);

    const matches = data.users.filter((user) => user.email?.toLowerCase() === email);
    if (matches.length > 1) {
      throw new Error(`More than one Auth account uses ${email}; no password was changed.`);
    }
    if (matches.length === 1) return matches[0];
    if (data.users.length < 1000) break;
  }

  return null;
}

async function main() {
  console.log('AMCOMS staff password reset (passwords are entered locally and never displayed).');
  const supabaseUrl = (await prompt('Supabase project URL: ')).trim();
  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ', { hidden: true })).trim();

  let supabase;
  try {
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    throw new Error('The Supabase URL or service-role key is invalid.');
  }

  console.log('\nStaff accounts:');
  staffAccounts.forEach((account, index) => {
    console.log(`${index + 1}. ${account.name} — ${account.email}`);
  });

 const rawSelection = await prompt('Select account number: ');
const selected = Number(rawSelection.trim());

console.log('DEBUG selection:', JSON.stringify(rawSelection));
console.log('DEBUG parsed number:', selected);

if (
  !Number.isInteger(selected) ||
  selected < 1 ||
  selected > staffAccounts.length
) {
  throw new Error('Choose one of the listed account numbers.');
}

  const account = staffAccounts[selected - 1];
  const authUser = await findAuthUserByEmail(supabase, account.email);
  if (!authUser) {
    throw new Error(`No Auth account found for ${account.email}; no password was changed.`);
  }

  const confirmation = (await prompt(`To confirm, type ${account.email}: `)).trim().toLowerCase();
  if (confirmation !== account.email) {
    throw new Error('Confirmation did not match; no password was changed.');
  }

  const password = await prompt('New password (hidden, at least 8 characters): ', { hidden: true });
  const passwordConfirmation = await prompt('Re-enter new password (hidden): ', { hidden: true });
  if (password.length < 8) {
    throw new Error('Use at least 8 characters; no password was changed.');
  }
  if (password !== passwordConfirmation) {
    throw new Error('Passwords did not match; no password was changed.');
  }

  const { error } = await supabase.auth.admin.updateUserById(authUser.id, { password });
  if (error) {
    throw new Error(`Supabase could not update the password: ${error.message}`);
  }

  console.log(`Password updated for ${account.name} (${account.email}).`);
}

main().catch((error) => {
  console.error(`\nPassword reset failed: ${error.message}`);
  process.exitCode = 1;
});

import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const staffUsername = 'inventory';

function generateTemporaryPassword() {
  const chars = Array.from({ length: 20 }, () =>
    passwordChars[randomInt(passwordChars.length)]
  );
  chars[0] = 'A';
  chars[1] = 'a';
  chars[2] = '2';
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
}

function prompt(label, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdin.setRawMode) {
      reject(new Error('Run this command in an interactive terminal.'));
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
      if (chunk.includes('\u001b')) return;

      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Cancelled. No account changes were made.'));
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
        if (character >= ' ' && character <= '~') {
          value += character;
          if (!hidden) stdout.write(character);
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function readProjectUrl() {
  const env = await readFile('.env.local', 'utf8');
  const match = env.match(/^\s*VITE_SUPABASE_URL\s*=\s*["']?([^"'#\r\n]+)["']?\s*$/m);
  if (!match) throw new Error('VITE_SUPABASE_URL was not found in .env.local.');

  const url = match[1].trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error('VITE_SUPABASE_URL is not a valid Supabase project URL.');
  }
  return url;
}

async function main() {
  const supabaseUrl = await readProjectUrl();
  console.log(`Project: ${new URL(supabaseUrl).host}`);
  console.log('This command only resets the active inventory account password.');
  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ', { hidden: true })).trim();
  if (!serviceRoleKey) throw new Error('A service-role key is required. No account changes were made.');

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: accounts, error: accountError } = await admin
    .from('staff')
    .select('id, user_id, username, auth_email, email, full_name, role, is_active')
    .eq('role', 'inventory')
    .eq('is_active', true);
  if (accountError) throw new Error(`Could not read the inventory account: ${accountError.message}`);
  if (!accounts || accounts.length !== 1) {
    throw new Error(`Expected one active inventory account; found ${accounts?.length ?? 0}. No changes were made.`);
  }

  const staff = accounts[0];
  const loginEmail = staff.auth_email?.trim().toLowerCase() || staff.email?.trim().toLowerCase();
  if (staff.username?.toLowerCase() !== staffUsername || !staff.user_id || !loginEmail) {
    throw new Error('The active inventory account is missing the expected username, Auth link, or login email. No changes were made.');
  }

  const { data: authResult, error: authError } = await admin.auth.admin.getUserById(staff.user_id);
  if (authError || !authResult.user) {
    throw new Error(`Could not verify the inventory Auth account${authError ? `: ${authError.message}` : '.'} No changes were made.`);
  }
  if (authResult.user.email?.trim().toLowerCase() !== loginEmail) {
    throw new Error('The inventory profile does not match its linked Auth account. No changes were made.');
  }

  console.log(`\nAccount: ${staff.full_name || staff.username} (${staff.username})`);
  const confirmation = (await prompt('Type RESET INVENTORY to generate a temporary password: ')).trim();
  if (confirmation !== 'RESET INVENTORY') {
    console.log('Cancelled. No account changes were made.');
    return;
  }

  const { error: flagError } = await admin
    .from('staff')
    .update({ must_change_password: true })
    .eq('id', staff.id)
    .eq('user_id', staff.user_id);
  if (flagError) throw new Error(`Could not require a password change: ${flagError.message}`);

  const temporaryPassword = generateTemporaryPassword();
  const { error: passwordError } = await admin.auth.admin.updateUserById(staff.user_id, {
    password: temporaryPassword,
  });
  if (passwordError) {
    throw new Error(`The password could not be reset: ${passwordError.message}. The account is flagged to require a password change.`);
  }

  console.log('\nTemporary inventory credentials (share securely; this password is shown only once):');
  console.log(`Username: ${staff.username}`);
  console.log(`Temporary password: ${temporaryPassword}`);
  console.log('The user will be required to choose a new password before accessing the inventory dashboard.');
}

main().catch((error) => {
  console.error(`\nInventory password reset failed: ${error.message}`);
  process.exitCode = 1;
});

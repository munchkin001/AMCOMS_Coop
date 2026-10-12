import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const passwordLength = 20;
const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const staffRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory'];

function generateTemporaryPassword() {
  const chars = Array.from({ length: passwordLength }, () =>
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
      reject(new Error('Run this script in an interactive terminal.'));
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
  if (!match) {
    throw new Error('VITE_SUPABASE_URL was not found in .env.local.');
  }

  const url = match[1].trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error('VITE_SUPABASE_URL in .env.local is not a valid Supabase project URL.');
  }
  return url;
}

async function getStaffAccounts(admin) {
  const { data, error } = await admin
    .from('staff')
    .select('user_id, username, email, full_name, role')
    .in('role', staffRoles)
    .order('role')
    .order('email');
  if (error) throw new Error(`Could not read staff records: ${error.message}`);
  if (!data?.length) throw new Error('No staff-role accounts were found; nothing was changed.');

  const seenIds = new Set();
  for (const staff of data) {
    if (!staff.user_id || !staff.email) {
      throw new Error(
        `Staff row ${staff.full_name || staff.username || '(unnamed)'} lacks a linked Auth ID or email. Nothing was changed.`
      );
    }
    if (seenIds.has(staff.user_id)) {
      throw new Error(`Auth ID ${staff.user_id} is linked to multiple staff rows. Nothing was changed.`);
    }
    seenIds.add(staff.user_id);
  }
  return data;
}

async function main() {
  const supabaseUrl = await readProjectUrl();
  console.log(`Project: ${new URL(supabaseUrl).host}`);
  console.log(`This changes passwords for ${staffRoles.join(', ')} accounts only; it does not delete accounts.`);
  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ')).trim();
  if (!serviceRoleKey) throw new Error('A service-role key is required.');

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const staffAccounts = await getStaffAccounts(admin);
  const targets = [];

  for (const staff of staffAccounts) {
    const { data, error } = await admin.auth.admin.getUserById(staff.user_id);
    if (error || !data.user) {
      throw new Error(`Could not verify Auth account for ${staff.email}; no passwords were changed.`);
    }
    if (data.user.email?.trim().toLowerCase() !== staff.email.trim().toLowerCase()) {
      throw new Error(
        `Auth email does not match the staff record for ${staff.full_name || staff.username}; no passwords were changed.`
      );
    }
    targets.push({ staff, authUserId: data.user.id });
  }

  console.log(`\nVerified ${targets.length} staff-to-Auth account links:`);
  for (const { staff } of targets) {
    console.log(`- ${staff.full_name || staff.username} (${staff.role}): ${staff.email}`);
  }
  const confirmation = (await prompt('\nType RESET ALL STAFF to set new temporary passwords: ')).trim();
  if (confirmation !== 'RESET ALL STAFF') {
    console.log('Cancelled. No passwords were changed.');
    return;
  }

  const results = [];
  for (const target of targets) {
    const temporaryPassword = generateTemporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(target.authUserId, {
      password: temporaryPassword,
    });
    results.push({ ...target, temporaryPassword, error });
  }

  console.log('\nTemporary passwords for successfully reset accounts (share securely and require replacement):');
  for (const result of results) {
    const name = result.staff.full_name || result.staff.username || result.staff.email;
    if (result.error) {
      console.error(`- FAILED ${name} (${result.staff.email}): ${result.error.message}`);
    } else {
      console.log(`- ${name} (${result.staff.email}): ${result.temporaryPassword}`);
    }
  }

  const failed = results.filter((result) => result.error);
  if (failed.length) {
    throw new Error(`${failed.length} password reset(s) failed; successful resets are listed above.`);
  }
  console.log(`\nSuccessfully reset ${results.length} staff account(s).`);
}

main().catch((error) => {
  console.error(`\nPassword reset failed: ${error.message}`);
  process.exitCode = 1;
});

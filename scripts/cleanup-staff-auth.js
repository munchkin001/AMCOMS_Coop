import { createClient } from '@supabase/supabase-js';
import { stdin, stdout } from 'node:process';

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

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

async function getAllAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list Supabase Auth users: ${error.message}`);

    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function getStaffRecords(admin) {
  const { data, error } = await admin
    .from('staff')
    .select('id, user_id, username, email, full_name, is_active, role');

  if (error) throw new Error(`Could not fetch staff records: ${error.message}`);
  return data ?? [];
}

async function main() {
  console.log('AMCOMS staff auth cleanup');
  console.log('This removes stale duplicate Supabase Auth records and keeps the staff table as the source of truth.');
  console.log('');

  const supabaseUrl = (await prompt('Supabase project URL: ')).trim();
  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ', { hidden: true })).trim();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const staffRows = await getStaffRecords(supabase);
  const authUsers = await getAllAuthUsers(supabase);

  const staffByEmail = new Map();
  for (const person of staffRows) {
    const email = normalizeEmail(person.email);
    if (!email) continue;
    if (!staffByEmail.has(email)) {
      staffByEmail.set(email, []);
    }
    staffByEmail.get(email).push(person);
  }

  const authByEmail = new Map();
  for (const user of authUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    if (!authByEmail.has(email)) {
      authByEmail.set(email, []);
    }
    authByEmail.get(email).push(user);
  }

  const keepByEmail = new Map();
  const deleteCandidates = [];

  for (const [email, staffList] of staffByEmail.entries()) {
    const authList = authByEmail.get(email) ?? [];
    const matchedStaff = staffList.find((person) => person.user_id && authList.some((user) => user.id === person.user_id));
    const canonicalAuth = matchedStaff ? authList.find((user) => user.id === matchedStaff.user_id) : (authList[0] ?? null);

    if (canonicalAuth) {
      keepByEmail.set(email, canonicalAuth.id);
    }

    for (const authUser of authList) {
      if (!canonicalAuth || authUser.id !== canonicalAuth.id) {
        deleteCandidates.push({
          email,
          authUserId: authUser.id,
          accountName: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email,
          reason: canonicalAuth ? 'duplicate-matching-email' : 'orphan-or-duplicate',
        });
      }
    }
  }

  for (const [email, authList] of authByEmail.entries()) {
    if (staffByEmail.has(email)) continue;
    for (const authUser of authList) {
      deleteCandidates.push({
        email,
        authUserId: authUser.id,
        accountName: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email,
        reason: 'no-staff-record',
      });
    }
  }

  const uniqueDeleteCandidates = [];
  const seen = new Set();
  for (const candidate of deleteCandidates) {
    if (seen.has(candidate.authUserId)) continue;
    seen.add(candidate.authUserId);
    uniqueDeleteCandidates.push(candidate);
  }

  uniqueDeleteCandidates.sort((a, b) => a.email.localeCompare(b.email) || a.authUserId.localeCompare(b.authUserId));

  console.log('Summary:');
  console.log(`- Staff records: ${staffRows.length}`);
  console.log(`- Auth users: ${authUsers.length}`);
  console.log(`- Safe deletions: ${uniqueDeleteCandidates.length}`);

  if (uniqueDeleteCandidates.length === 0) {
    console.log('No stale duplicate Auth users found. The staff table already matches the Auth users.');
    return;
  }

  console.log('');
  console.log('Candidates to remove:');
  for (const candidate of uniqueDeleteCandidates) {
    console.log(`- ${candidate.email} (${candidate.accountName}) — ${candidate.reason}`);
  }

  const confirmation = (await prompt('Type DELETE_STAFF_AUTH to permanently remove these Auth users: ')).trim();
  if (confirmation !== 'DELETE_STAFF_AUTH') {
    console.log('Cancelled. No Auth users were deleted.');
    return;
  }

  let deleted = 0;
  for (const candidate of uniqueDeleteCandidates) {
    const { error } = await supabase.auth.admin.deleteUser(candidate.authUserId);
    if (error) {
      console.error(`Could not delete ${candidate.email}: ${error.message}`);
      continue;
    }
    deleted += 1;
    console.log(`Deleted ${candidate.email}`);
  }

  console.log('');
  console.log(`Finished. Removed ${deleted} stale Auth users. The public.staff table remains the source of truth.`);
}

main().catch((error) => {
  console.error(`\nCleanup failed: ${error.message}`);
  process.exitCode = 1;
});

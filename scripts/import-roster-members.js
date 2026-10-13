import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const roster = [
  { member_number: 'OO1', first_name: 'JOVITO', last_name: 'ANDOY' },
  { member_number: 'OO3', first_name: 'EXEQUIL', last_name: 'LABIAL' },
  { member_number: 'OO4', first_name: 'ROSITA', last_name: 'BORROMEO' },
  { member_number: 'OO5', first_name: 'TITO', last_name: 'BAGUHIN' },
  { member_number: 'OO6', first_name: 'ALECIA', last_name: 'SIMON' },
  { member_number: 'OO7', first_name: 'JOSE', last_name: 'ANDOY' },
  { member_number: 'OO8', first_name: 'JOREME', last_name: 'OCAMPO' },
  { member_number: 'O10', first_name: 'HELEN', last_name: 'ANDOY' },
  { member_number: 'O11', first_name: 'ARACELI', last_name: 'CARABIO' },
  { member_number: 'O12', first_name: 'DELIA', last_name: 'VISTO' },
  { member_number: 'O13', first_name: 'ALBERTO JR.', last_name: 'DIONSON' },
  { member_number: 'O14', first_name: 'JELYN', last_name: 'SABAYDAY' },
  { member_number: 'O15', first_name: 'VENERANDO', last_name: 'VALIENTE' },
  { member_number: 'O16', first_name: 'FLORANTE SR.', last_name: 'RAMOSO' },
  { member_number: 'O17', first_name: 'SELVERIO', last_name: 'LADAO' },
  { member_number: 'O18', first_name: 'ELBERT', last_name: 'AZUMBRADO' },
  { member_number: 'O19', first_name: 'MARCIAL', last_name: 'GIL' },
  { member_number: 'O20', first_name: 'ELPEDIO', last_name: 'PARAISO' },
  { member_number: 'O21', first_name: 'NENITA', last_name: 'GAPUTAN' },
  { member_number: 'O22', first_name: 'ESTELLA', last_name: 'PALLUGNA' },
];

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

async function getProjectUrl() {
  const env = await readFile('.env.local', 'utf8');
  const match = env.match(/^\s*VITE_SUPABASE_URL\s*=\s*["']?([^"'#\r\n]+)["']?\s*$/m);
  if (!match) throw new Error('VITE_SUPABASE_URL was not found in .env.local.');

  const projectUrl = match[1].trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)) {
    throw new Error('VITE_SUPABASE_URL in .env.local is not a valid Supabase project URL.');
  }
  return projectUrl;
}

async function main() {
  const projectUrl = await getProjectUrl();
  console.log(`Project: ${new URL(projectUrl).host}`);
  console.log(`Ready to import ${roster.length} member records from the roster.`);
  console.log('No portal accounts will be created; addresses and other unavailable fields will remain empty.');

  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ')).trim();
  if (!serviceRoleKey) throw new Error('A service-role key is required.');

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const numbers = roster.map((member) => member.member_number);
  const { data: existing, error: existingError } = await supabase
    .from('members')
    .select('member_number, first_name, last_name')
    .in('member_number', numbers);
  if (existingError) throw new Error(`Could not check existing member numbers: ${existingError.message}`);

  const normalizedName = (member) =>
    `${member.first_name} ${member.last_name}`.trim().replace(/\s+/g, ' ').toLowerCase();
  const incomingNames = new Set(roster.map(normalizedName));
  const { data: existingNames, error: namesError } = await supabase
    .from('members')
    .select('member_number, first_name, last_name');
  if (namesError) throw new Error(`Could not check existing member names: ${namesError.message}`);

  const nameMatches = (existingNames ?? []).filter((member) => incomingNames.has(normalizedName(member)));
  if ((existing?.length ?? 0) || nameMatches.length) {
    console.error('Import stopped before writing anything because matching records already exist:');
    for (const member of existing ?? []) {
      console.error(`- Member number ${member.member_number}: ${member.first_name} ${member.last_name}`);
    }
    for (const member of nameMatches) {
      console.error(`- Matching name ${member.first_name} ${member.last_name} (${member.member_number})`);
    }
    throw new Error('Review the existing records before retrying; no member records were imported.');
  }

  const { data: bookkeepers, error: bookkeeperError } = await supabase
    .from('staff')
    .select('id')
    .eq('role', 'bookkeeper')
    .eq('is_active', true)
    .limit(2);
  if (bookkeeperError) throw new Error(`Could not identify the active bookkeeper: ${bookkeeperError.message}`);
  if (bookkeepers?.length !== 1) {
    throw new Error('Expected exactly one active bookkeeper to attribute the import; no records were imported.');
  }

  console.log('\nMembers to import:');
  for (const member of roster) {
    console.log(`- ${member.member_number}: ${member.first_name} ${member.last_name}`);
  }
  const confirmation = (await prompt('\nType IMPORT 20 MEMBERS to continue: ')).trim();
  if (confirmation !== 'IMPORT 20 MEMBERS') {
    console.log('Cancelled. No member records were imported.');
    return;
  }

  const rows = roster.map((member) => ({
    ...member,
    membership_type: 'regular',
    membership_status: 'active',
    created_by: bookkeepers[0].id,
  }));
  const { data: imported, error: importError } = await supabase
    .from('members')
    .insert(rows)
    .select('member_number');
  if (importError) throw new Error(`Member import failed: ${importError.message}`);
  if (imported?.length !== roster.length) {
    throw new Error(`Expected ${roster.length} imported members but the database returned ${imported?.length ?? 0}.`);
  }

  console.log(`Successfully imported ${imported.length} member records. No portal accounts were created.`);
}

main().catch((error) => {
  console.error(`\nMember import failed: ${error.message}`);
  process.exitCode = 1;
});

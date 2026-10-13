import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const roster = [
  { last_name: 'BANTUG', first_name: 'CARMEN', middle_name: 'A', account_number: '8-018', opening_balance: 3167.50 },
  { last_name: 'NAHIAL', first_name: 'MIGUELITA', account_number: '8-021', opening_balance: 14761.10 },
  { last_name: 'MAAGAD', first_name: 'AMADO', middle_name: 'Y', account_number: '8-067', opening_balance: 5029.74 },
  { last_name: 'DAGATAN', first_name: 'MICHAEL', account_number: '8-071', opening_balance: 6289.11 },
  { last_name: 'GAPUTAN', first_name: 'CONCEPCION', middle_name: 'B', account_number: '8-080', opening_balance: 7404.36 },
  { last_name: 'ABAO', first_name: 'ANITA', account_number: '8-119', opening_balance: 2939.81 },
  { last_name: 'GAPUTAN', first_name: 'GEE MARIEL', account_number: '8-150', opening_balance: 3078.28 },
  { last_name: 'CASTILLO', first_name: 'DENJIE', account_number: '8-166', opening_balance: 3328.30 },
  { last_name: 'CASTILLO', first_name: 'IRENE', account_number: '8-165', opening_balance: 1402.09 },
  { last_name: 'BERONILLA', first_name: 'FRANCIS DANIEL', account_number: '8-174', opening_balance: 2483.37 },
  { last_name: 'LUNAO', first_name: 'K.C.', account_number: '8-223', opening_balance: 3412.00 },
  { last_name: 'CASTILLO', first_name: 'DANILO', account_number: '8-227', opening_balance: 3660.17 },
  { last_name: 'CASTILLO', first_name: 'ISAGANI', account_number: '8-234', opening_balance: 3359.79 },
  { last_name: 'GINFAMCO', first_name: 'GINFAMCO', account_number: '8-300', opening_balance: 4038.72 },
  { last_name: 'KALIPI', first_name: 'KALIPI', account_number: '8-324', opening_balance: 4859.91 },
  { last_name: 'BUCIO', first_name: 'RACHELLE KAYE', account_number: '8-347', opening_balance: 9424.93 },
  { last_name: 'VISTO', first_name: 'MARIAN NICOLE', account_number: '8-348', opening_balance: 3360.15 },
  { last_name: 'NAVALUNA', first_name: 'PAUL MIKKI', middle_name: 'P', account_number: '8-447', opening_balance: 26615.45 },
  { last_name: 'LABIAL', first_name: 'KURT RAPHAEL', middle_name: 'L', account_number: '8-477', opening_balance: 20897.11 },
  { last_name: 'CABANOS', first_name: 'JOVENTINO', account_number: '8-488', opening_balance: 2041.41 },
  { last_name: 'BEC PH2', first_name: 'AGAY-AYAN', account_number: '8-490', opening_balance: 5271.33 },
  { last_name: 'SALON', first_name: 'CONIE', account_number: '8-495', opening_balance: 592.15 },
  { last_name: 'VIDAL', first_name: 'ARNEL', account_number: '8-499', opening_balance: 7851.68 },
  { last_name: 'ARELLANO', first_name: 'LOLITA', middle_name: 'L', account_number: '8-504', opening_balance: 14245.07 },
  { last_name: 'BARCENAS', first_name: 'ARCENTO', account_number: '8-510', opening_balance: 7264.69 },
  { last_name: 'SABELLO', first_name: 'ELIGIO', account_number: '8-522', opening_balance: 2489.14 },
  { last_name: 'GAPUTAN', first_name: 'CATHECHIST', account_number: '8-538', opening_balance: 3310.31 },
  { last_name: 'ABAO', first_name: 'RAMIL', account_number: '8-539', opening_balance: 9163.38 },
  { last_name: 'VILLAFRANCA', first_name: 'RENATO', account_number: '8-549', opening_balance: 3451.33 },
  { last_name: 'VISTO', first_name: 'RHEMOND ALFRED', account_number: '8-551', opening_balance: 950.29 },
  { last_name: 'VISTO', first_name: 'RALPH GEROME', account_number: '8-552', opening_balance: 1365.60 },
  { last_name: 'VISTO', first_name: 'RONA', account_number: '8-553', opening_balance: 703.33 },
  { last_name: 'SMPH', first_name: 'AGAY-AYAN', account_number: '8-558', opening_balance: 26723.68 },
  { last_name: 'MADRAZO', first_name: 'JANA', account_number: '8-562', opening_balance: 961.92 },
  { last_name: 'VILLAMOR', first_name: 'ROLAN MAR', account_number: '8-563', opening_balance: 660.50 },
  { last_name: 'CAGO', first_name: 'JEBERT', account_number: '8-565', opening_balance: 3390.32 },
  { last_name: 'SUMAMPONG', first_name: 'ALLYSA', account_number: '8-566', opening_balance: 993.58 },
  { last_name: 'TUMBAGA', first_name: 'CORAZON', account_number: '8-575', opening_balance: 1023.87 },
  { last_name: 'MONSERAT', first_name: 'CALVEZ', account_number: '8-580', opening_balance: 1341.70 },
  { last_name: 'BANTIG', first_name: 'CARMELITO', account_number: '8-585', opening_balance: 698.43 }
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

const normalizedName = (member) =>
  [member.first_name, member.middle_name, member.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

async function rollbackImportedRows(supabase, { memberIds, accountIds = [], transactionIds = [] }) {
  const cleanupErrors = [];
  if (transactionIds.length) {
    const { error } = await supabase.from('savings_transactions').delete().in('id', transactionIds);
    if (error) cleanupErrors.push(`Could not remove imported opening-balance transactions: ${error.message}`);
  }
  if (accountIds.length) {
    const { error } = await supabase.from('savings_accounts').delete().in('id', accountIds);
    if (error) cleanupErrors.push(`Could not remove imported savings accounts: ${error.message}`);
  }
  if (memberIds.length) {
    const { error } = await supabase.from('members').delete().in('id', memberIds);
    if (error) cleanupErrors.push(`Could not remove imported member records: ${error.message}`);
  }
  return cleanupErrors;
}

async function main() {
  const projectUrl = await getProjectUrl();
  console.log(`Project: ${new URL(projectUrl).host}`);
  console.log(`Ready to import ${roster.length} Associate members and their savings account opening balances.`);
  console.log('Opening balances will be recorded in savings transaction history. No portal accounts, cash receipts, or general ledger entries will be created.');
  console.log('Member addresses and dates of birth will remain empty.');

  const serviceRoleKey = (await prompt('Supabase service-role key (hidden): ')).trim();
  if (!serviceRoleKey) throw new Error('A service-role key is required.');

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const accountNumbers = roster.map((member) => member.account_number);
  const { data: existingAccounts, error: accountsError } = await supabase
    .from('savings_accounts')
    .select('account_number')
    .in('account_number', accountNumbers);
  if (accountsError) throw new Error(`Could not check existing savings accounts: ${accountsError.message}`);

  const incomingNames = new Set(roster.map(normalizedName));
  const { data: existingMembers, error: membersError } = await supabase
    .from('members')
    .select('id, member_number, first_name, middle_name, last_name');
  if (membersError) throw new Error(`Could not check existing members: ${membersError.message}`);

  const nameMatches = (existingMembers || []).filter((member) => incomingNames.has(normalizedName(member)));
  if (existingAccounts?.length || nameMatches.length) {
    console.error('Import stopped before writing anything because matching records already exist:');
    for (const account of existingAccounts || []) {
      console.error(`- Savings account ${account.account_number}`);
    }
    for (const member of nameMatches) {
      console.error(`- Matching member ${member.first_name} ${member.middle_name || ''} ${member.last_name} (${member.member_number})`);
    }
    throw new Error('Review the existing records before retrying; no records were imported.');
  }

  const { data: bookkeepers, error: bookkeepersError } = await supabase
    .from('staff')
    .select('id')
    .eq('role', 'bookkeeper')
    .eq('is_active', true)
    .limit(2);
  if (bookkeepersError) throw new Error(`Could not identify the active bookkeeper: ${bookkeepersError.message}`);
  if (bookkeepers?.length !== 1) {
    throw new Error('Expected exactly one active bookkeeper to attribute the import; no records were imported.');
  }

  const year = new Date().getFullYear();
  const firstNumber = (existingMembers?.length || 0) + 1;
  const memberNumbers = roster.map((_, index) => `M-${year}-${String(firstNumber + index).padStart(5, '0')}`);
  const existingMemberNumbers = new Set((existingMembers || []).map((member) => member.member_number));
  const numberConflicts = memberNumbers.filter((number) => existingMemberNumbers.has(number));
  if (numberConflicts.length) {
    throw new Error(`Generated member numbers already exist (${numberConflicts.join(', ')}); no records were imported.`);
  }
  const memberRows = roster.map((member, index) => ({
    member_number: memberNumbers[index],
    first_name: member.first_name,
    middle_name: member.middle_name || null,
    last_name: member.last_name,
    membership_type: 'associate',
    membership_status: 'active',
    created_by: bookkeepers[0].id
  }));

  console.log('\nMembers to import:');
  for (const member of roster) {
    console.log(`- ${member.last_name}, ${member.first_name}${member.middle_name ? ` ${member.middle_name}` : ''} · ${member.account_number} · ₱${member.opening_balance.toFixed(2)}`);
  }
  const confirmation = (await prompt(`\nType IMPORT ${roster.length} ASSOCIATES to continue: `)).trim();
  if (confirmation !== `IMPORT ${roster.length} ASSOCIATES`) {
    console.log('Cancelled. No records were imported.');
    return;
  }

  const { data: importedMembers, error: importMembersError } = await supabase
    .from('members')
    .insert(memberRows)
    .select('id, member_number');
  if (importMembersError) throw new Error(`Member import failed: ${importMembersError.message}`);
  if (importedMembers?.length !== roster.length) {
    throw new Error(`Expected ${roster.length} imported members but the database returned ${importedMembers?.length ?? 0}.`);
  }

  const membersByNumber = new Map(importedMembers.map((member) => [member.member_number, member]));
  const savingsRows = roster.map((member, index) => ({
    account_number: member.account_number,
    member_id: membersByNumber.get(memberNumbers[index]).id,
    account_type: 'regular',
    balance: member.opening_balance
  }));
  const { data: importedAccountsResult, error: importAccountsError } = await supabase
    .from('savings_accounts')
    .insert(savingsRows)
    .select('id, account_number');
  if (importAccountsError || importedAccountsResult?.length !== roster.length) {
    const cleanupErrors = await rollbackImportedRows(supabase, {
      memberIds: importedMembers.map((member) => member.id),
      accountIds: (importedAccountsResult || []).map((account) => account.id)
    });
    const cause = importAccountsError?.message || `expected ${roster.length} accounts but received ${importedAccountsResult?.length ?? 0}`;
    throw new Error(`Savings account import failed: ${cause}${cleanupErrors.length ? `; ${cleanupErrors.join('; ')}` : ''}`);
  }

  const accountsByNumber = new Map(importedAccountsResult.map((account) => [account.account_number, account]));
  const transactionRows = roster.map((member) => ({
    savings_account_id: accountsByNumber.get(member.account_number).id,
    transaction_type: 'deposit',
    amount: member.opening_balance,
    balance_after: member.opening_balance,
    description: 'Opening balance imported from associate member roster',
    reference_number: member.account_number,
    created_by: bookkeepers[0].id
  }));
  const { data: importedTransactions, error: importTransactionsError } = await supabase
    .from('savings_transactions')
    .insert(transactionRows)
    .select('id');
  if (importTransactionsError || importedTransactions?.length !== roster.length) {
    const cleanupErrors = await rollbackImportedRows(supabase, {
      memberIds: importedMembers.map((member) => member.id),
      accountIds: importedAccountsResult.map((account) => account.id),
      transactionIds: (importedTransactions || []).map((transaction) => transaction.id)
    });
    const cause = importTransactionsError?.message || `expected ${roster.length} transactions but received ${importedTransactions?.length ?? 0}`;
    throw new Error(`Opening-balance transaction import failed: ${cause}${cleanupErrors.length ? `; ${cleanupErrors.join('; ')}` : ''}`);
  }

  console.log(`Successfully imported ${importedMembers.length} Associate members, ${importedAccountsResult.length} savings accounts, and ${importedTransactions.length} opening-balance transactions. No portal accounts, cash receipts, or general ledger entries were created.`);
}

main().catch((error) => {
  console.error(`\nAssociate import failed: ${error.message}`);
  process.exitCode = 1;
});

import { supabase } from './supabase';

export const fetchAccountBalances = async (from = null, to = null) => {
  const { data, error } = await supabase.rpc('get_account_balances', {
    p_from: from,
    p_to: to
  });

  if (error) throw error;
  return data || [];
};

export const summarizeAccountBalances = (accounts) => accounts.reduce((summary, account) => {
  const closingBalance = Number(account.closing_balance) || 0;
  const accountName = account.account_name?.toLowerCase() || '';

  if (account.account_type === 'asset') {
    summary.totalAssets += closingBalance;
    if (accountName.includes('cash') && !accountName.includes('bank')) {
      summary.cashOnHand += closingBalance;
    }
    if (accountName.includes('bank')) {
      summary.cashInBank += closingBalance;
    }
  } else if (account.account_type === 'liability') {
    summary.totalLiabilities += closingBalance;
  } else if (account.account_type === 'equity') {
    summary.totalEquity += closingBalance;
  }

  summary.totalIncome += account.account_type === 'revenue'
    ? (Number(account.total_credit) || 0) - (Number(account.total_debit) || 0)
    : 0;
  summary.totalExpenses += account.account_type === 'expense'
    ? (Number(account.total_debit) || 0) - (Number(account.total_credit) || 0)
    : 0;
  summary.periodIncome += account.account_type === 'revenue'
    ? (Number(account.period_credit) || 0) - (Number(account.period_debit) || 0)
    : 0;
  summary.periodExpenses += account.account_type === 'expense'
    ? (Number(account.period_debit) || 0) - (Number(account.period_credit) || 0)
    : 0;

  return summary;
}, {
  totalAssets: 0,
  totalLiabilities: 0,
  totalEquity: 0,
  totalIncome: 0,
  totalExpenses: 0,
  periodIncome: 0,
  periodExpenses: 0,
  cashOnHand: 0,
  cashInBank: 0
});

export const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const fetchMonthlyFinancialSummary = async (monthCount = 6) => {
  const now = new Date();
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - monthCount + index + 1, 1);
    const from = toDateString(date);
    const to = index === monthCount - 1
      ? toDateString(now)
      : toDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));

    return {
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      from,
      to
    };
  });

  const monthlyAccounts = await Promise.all(
    months.map(({ from, to }) => fetchAccountBalances(from, to))
  );
  const summaries = monthlyAccounts.map(summarizeAccountBalances);

  return {
    labels: months.map((month) => month.label),
    income: summaries.map((summary) => summary.periodIncome),
    expenses: summaries.map((summary) => summary.periodExpenses),
    currentIncome: summaries.at(-1)?.periodIncome || 0,
    currentExpenses: summaries.at(-1)?.periodExpenses || 0
  };
};

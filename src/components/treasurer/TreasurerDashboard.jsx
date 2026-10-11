import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Gem,
  HandCoins,
  Landmark,
  Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';

const EMPTY_DASHBOARD = {
  todayCollections: 0,
  todayDisbursements: 0,
  todayLoanPayments: 0,
  todayLoanReleases: 0,
  loanReleaseCount: 0,
  todaySavingsDeposits: 0,
  todaySavingsWithdrawals: 0,
  todayTimeDepositTransactions: 0,
  timeDepositTransactionCount: 0,
  collectionCount: 0,
  disbursementCount: 0,
  loanPaymentCount: 0,
  savingsDepositCount: 0,
  savingsWithdrawalCount: 0,
  totalSavingsBalance: 0,
  totalTimeDepositBalance: 0,
  totalLoanBalance: 0,
  cashOnHand: 0,
  collectionBreakdown: [],
  disbursementBreakdown: []
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);

const buildCashBreakdown = (cashRows, relatedRows, getCashId, classifyRelatedRow) => {
  const categoriesByCashId = new Map();
  relatedRows.forEach((row) => {
    const cashId = getCashId(row);
    const category = classifyRelatedRow(row);
    if (cashId && category && !categoriesByCashId.has(cashId)) {
      categoriesByCashId.set(cashId, category);
    }
  });

  const totals = new Map();
  cashRows.forEach((row) => {
    const category = categoriesByCashId.get(row.id) || 'Other';
    totals.set(category, (totals.get(category) || 0) + Number(row.amount || 0));
  });

  const totalAmount = sum(cashRows, 'amount');
  return Array.from(totals, ([label, amount]) => ({
    label,
    amount,
    percentage: totalAmount ? Math.round((amount / totalAmount) * 100) : 0
  }));
};

const getRelatedAccountType = (transaction) => {
  const account = transaction.savings_accounts;
  return Array.isArray(account) ? account[0]?.account_type : account?.account_type;
};

const TreasurerDashboard = () => {
  const [today, setToday] = useState(() => toDateString(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const requestId = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const [
        receiptsResult,
        disbursementsResult,
        loanPaymentsResult,
        savingsTransactionsResult,
        loanReleasesResult,
        savingsAccountsResult,
        activeLoansResult,
        accountRows
      ] = await Promise.all([
        supabase.from('cash_receipts')
          .select('id, receipt_date, receipt_number, received_from, description, amount, created_at')
          .eq('status', 'recorded').eq('receipt_date', today).order('created_at', { ascending: false }),
        supabase.from('cash_disbursements')
          .select('id, disbursement_date, voucher_number, payee, description, amount, created_at')
          .eq('status', 'recorded').eq('disbursement_date', today).order('created_at', { ascending: false }),
        supabase.from('loan_payments').select('amount_paid, receipt_id')
          .eq('payment_date', today),
        supabase.from('savings_transactions')
          .select('transaction_type, amount, receipt_id, disbursement_id, savings_accounts!inner(account_type)')
          .eq('transaction_date', today),
        supabase.from('loans').select('principal_amount')
          .eq('release_date', today).neq('status', 'rejected'),
        supabase.from('savings_accounts').select('balance, account_type').eq('status', 'active'),
        supabase.from('loans').select('balance').eq('status', 'active'),
        fetchAccountBalances()
      ]);

      const failedResult = [
        receiptsResult,
        disbursementsResult,
        loanPaymentsResult,
        savingsTransactionsResult,
        loanReleasesResult,
        savingsAccountsResult,
        activeLoansResult
      ].find((result) => result.error);
      if (failedResult) throw failedResult.error;

      const receipts = receiptsResult.data || [];
      const disbursements = disbursementsResult.data || [];
      const loanPayments = loanPaymentsResult.data || [];
      const savingsTransactions = savingsTransactionsResult.data || [];
      const loanReleases = loanReleasesResult.data || [];
      const savingsAccounts = savingsAccountsResult.data || [];
      const activeLoans = activeLoansResult.data || [];
      const regularTransactions = savingsTransactions.filter(
        (transaction) => getRelatedAccountType(transaction) !== 'time_deposit'
      );
      const timeDepositTransactions = savingsTransactions.filter(
        (transaction) => getRelatedAccountType(transaction) === 'time_deposit'
      );
      const savingsDeposits = regularTransactions.filter((transaction) => transaction.transaction_type === 'deposit');
      const savingsWithdrawals = regularTransactions.filter((transaction) => transaction.transaction_type === 'withdrawal');
      const totalTimeDepositTransactions = sum(timeDepositTransactions, 'amount');

      const collectionBreakdown = buildCashBreakdown(
        receipts,
        [
          ...loanPayments.map((payment) => ({ ...payment, sourceType: 'loan_payment' })),
          ...savingsTransactions
        ],
        (row) => row.receipt_id,
        (row) => {
          if (row.sourceType === 'loan_payment') return 'Loan Payments';
          if (row.transaction_type !== 'deposit') return null;
          return getRelatedAccountType(row) === 'time_deposit' ? 'Time Deposits' : 'Savings Deposits';
        }
      );
      const disbursementBreakdown = buildCashBreakdown(
        disbursements,
        savingsTransactions.filter((transaction) => transaction.transaction_type === 'withdrawal'),
        (row) => row.disbursement_id,
        (row) => getRelatedAccountType(row) === 'time_deposit' ? 'Time Deposit Withdrawals' : 'Savings Withdrawals'
      );

      const recent = [
        ...receipts.map((receipt) => ({
          id: `receipt-${receipt.id}`,
          time: new Date(receipt.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          type: 'Cash Receipt',
          description: receipt.description || receipt.received_from,
          reference: receipt.receipt_number,
          amount: Number(receipt.amount || 0),
          createdAt: receipt.created_at
        })),
        ...disbursements.map((disbursement) => ({
          id: `disbursement-${disbursement.id}`,
          time: new Date(disbursement.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          type: 'Cash Disbursement',
          description: disbursement.description || disbursement.payee,
          reference: disbursement.voucher_number,
          amount: Number(disbursement.amount || 0),
          createdAt: disbursement.created_at
        }))
      ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 10);

      const nextDashboardData = {
        ...EMPTY_DASHBOARD,
        todayCollections: sum(receipts, 'amount'),
        todayDisbursements: sum(disbursements, 'amount'),
        todayLoanPayments: sum(loanPayments, 'amount_paid'),
        todayLoanReleases: sum(loanReleases, 'principal_amount'),
        loanReleaseCount: loanReleases.length,
        todaySavingsDeposits: sum(savingsDeposits, 'amount'),
        todaySavingsWithdrawals: sum(savingsWithdrawals, 'amount'),
        todayTimeDepositTransactions: totalTimeDepositTransactions,
        timeDepositTransactionCount: timeDepositTransactions.length,
        collectionCount: receipts.length,
        disbursementCount: disbursements.length,
        loanPaymentCount: loanPayments.length,
        savingsDepositCount: savingsDeposits.length,
        savingsWithdrawalCount: savingsWithdrawals.length,
        totalSavingsBalance: savingsAccounts
          .filter((account) => account.account_type !== 'time_deposit')
          .reduce((total, account) => total + Number(account.balance || 0), 0),
        totalTimeDepositBalance: savingsAccounts
          .filter((account) => account.account_type === 'time_deposit')
          .reduce((total, account) => total + Number(account.balance || 0), 0),
        totalLoanBalance: sum(activeLoans, 'balance'),
        cashOnHand: summarizeAccountBalances(accountRows).cashOnHand,
        collectionBreakdown,
        disbursementBreakdown
      };

      if (currentRequest !== requestId.current) return;
      setDashboardData(nextDashboardData);
      setRecentTransactions(recent);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Error fetching dashboard data:', loadError);
      setError(`Unable to load treasury data: ${loadError.message}`);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchDashboardData();
    return () => {
      requestId.current += 1;
    };
  }, [fetchDashboardData]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = setTimeout(() => setToday(toDateString(new Date())), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timeout);
  }, [today]);

  useMultipleRealtimeSubscriptions([
    'cash_receipts',
    'cash_disbursements',
    'loan_payments',
    'savings_transactions',
    'loans',
    'savings_accounts',
    'chart_of_accounts',
    'journal_entries',
    'journal_entry_lines'
  ].map((table) => ({ table, onUpdate: fetchDashboardData })), [fetchDashboardData]);

  const data = dashboardData || EMPTY_DASHBOARD;
  const hasData = dashboardData !== null;
  const displayAmount = (amount) => loading && !hasData ? 'Loading…' : !hasData ? 'Unavailable' : formatMoney(amount);
  const displayCount = (count) => loading && !hasData ? '…' : !hasData ? '—' : count.toLocaleString();
  const totalCashFlow = data.todayCollections - data.todayDisbursements;
  const summaryCards = [
    { label: "Today's Cash Received", value: displayAmount(data.todayCollections), icon: ArrowDownLeft, tone: 'green', detail: `${displayCount(data.collectionCount)} receipts` },
    { label: "Today's Cash Released", value: displayAmount(data.todayDisbursements), icon: ArrowUpFromLine, tone: 'red', detail: `${displayCount(data.disbursementCount)} disbursements` },
    { label: "Today's Loan Payments", value: displayAmount(data.todayLoanPayments), icon: HandCoins, tone: 'blue', detail: `${displayCount(data.loanPaymentCount)} payments` },
    { label: "Today's Loan Releases", value: displayAmount(data.todayLoanReleases), icon: Banknote, tone: 'orange', detail: `${displayCount(data.loanReleaseCount)} loans` },
    { label: "Today's Savings Deposits", value: displayAmount(data.todaySavingsDeposits), icon: Landmark, tone: 'cyan', detail: `${displayCount(data.savingsDepositCount)} deposits` },
    { label: "Today's Savings Withdrawals", value: displayAmount(data.todaySavingsWithdrawals), icon: ArrowDownToLine, tone: 'orange', detail: `${displayCount(data.savingsWithdrawalCount)} withdrawals` },
    { label: "Today's Time Deposit Activity", value: displayAmount(data.todayTimeDepositTransactions), icon: Gem, tone: 'purple', detail: `${displayCount(data.timeDepositTransactionCount)} transactions` },
    { label: 'Cash on Hand', value: displayAmount(data.cashOnHand), icon: Wallet, tone: 'green', detail: 'Current ledger balance' }
  ];

  const renderBreakdown = (items, emptyMessage, color) => {
    if (loading && !hasData) return <p className="py-8 text-center text-gray-500">Loading transactions…</p>;
    if (!hasData) return <p className="py-8 text-center text-gray-500">Data is unavailable.</p>;
    if (items.length === 0) return <p className="py-8 text-center text-gray-500">{emptyMessage}</p>;

    return items.map((item) => (
      <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{item.label}</p>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
            <div className={`h-2 rounded-full ${color}`} style={{ width: `${item.percentage}%` }} />
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${color === 'bg-green-600' ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoney(item.amount)}
          </p>
          <p className="text-xs text-gray-500">{item.percentage}%</p>
        </div>
      </div>
    ));
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Today's Cash Receipts</h3>
          <div className="space-y-3">
            {renderBreakdown(data.collectionBreakdown, 'No recorded receipts today.', 'bg-green-600')}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="font-bold text-gray-900">Total Cash Received</span>
              <span className="text-lg font-bold text-green-600">{displayAmount(data.todayCollections)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Today's Cash Disbursements</h3>
          <div className="space-y-3">
            {renderBreakdown(data.disbursementBreakdown, 'No recorded disbursements today.', 'bg-red-600')}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="font-bold text-gray-900">Total Cash Released</span>
              <span className="text-lg font-bold text-red-600">{displayAmount(data.todayDisbursements)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Today's Transaction Counts</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[
            ['Loan payments', data.loanPaymentCount, data.todayLoanPayments],
            ['Loan releases', data.loanReleaseCount, data.todayLoanReleases],
            ['Savings deposits', data.savingsDepositCount, data.todaySavingsDeposits],
            ['Savings withdrawals', data.savingsWithdrawalCount, data.todaySavingsWithdrawals],
            ['Time deposit transactions', data.timeDepositTransactionCount, data.todayTimeDepositTransactions]
          ].map(([label, count, amount]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{displayCount(count)}</p>
              <p className="mt-1 text-xs text-gray-500">{displayAmount(amount)} total</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Today's Cash Transactions</h3>
          <div className="flex gap-3 text-sm font-medium">
            <Link to="/staff/cash-receipts" className="text-teal-600 hover:text-teal-700">Receipts</Link>
            <Link to="/staff/cash-disbursements" className="text-teal-600 hover:text-teal-700">Disbursements</Link>
          </div>
        </div>
        {loading && !hasData ? (
          <p className="py-12 text-center text-gray-500">Loading transactions…</p>
        ) : recentTransactions.length === 0 ? (
          <p className="py-12 text-center text-gray-500">
            {hasData ? 'No recorded cash transactions today.' : 'Transaction data is unavailable.'}
          </p>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-gray-500">{transaction.time}</span>
                    <span className="text-sm font-semibold text-gray-900">{transaction.type}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-600">{transaction.description}</p>
                  <p className="mt-1 text-xs text-gray-500">Ref: {transaction.reference}</p>
                </div>
                <p className="text-right font-bold text-gray-900">{formatMoney(transaction.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Account Balances</h3>
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-1 text-sm text-gray-600">Savings and Time Deposit Balances</p>
              <p className="text-2xl font-bold text-green-600">
                {displayAmount(data.totalSavingsBalance + data.totalTimeDepositBalance)}
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-1 text-sm text-gray-600">Active Loan Balance</p>
              <p className="text-2xl font-bold text-blue-600">{displayAmount(data.totalLoanBalance)}</p>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <p className="mb-1 text-sm text-gray-600">Cash on Hand</p>
              <p className="text-2xl font-bold text-purple-600">{displayAmount(data.cashOnHand)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 p-6 text-white shadow">
          <h3 className="mb-4 text-lg font-semibold">Net Cash Flow (Today)</h3>
          {!hasData && loading ? (
            <p>Loading cash-flow data…</p>
          ) : !hasData ? (
            <p>Cash-flow data is unavailable.</p>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm text-teal-100">Cash Received</p>
                <p className="text-3xl font-bold">{formatMoney(data.todayCollections)}</p>
                <p className="mt-1 text-xs text-teal-200">{data.collectionCount} receipts</p>
              </div>
              <div>
                <p className="mb-2 text-sm text-teal-100">Cash Released</p>
                <p className="text-3xl font-bold">{formatMoney(data.todayDisbursements)}</p>
                <p className="mt-1 text-xs text-teal-200">{data.disbursementCount} disbursements</p>
              </div>
              <div className="border-t border-teal-500 pt-4">
                <p className="mb-2 text-sm text-teal-100">Net Flow</p>
                <p className={`text-4xl font-bold ${totalCashFlow >= 0 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {totalCashFlow >= 0 ? '+' : ''}{formatMoney(totalCashFlow)}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TreasurerDashboard;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Gem,
  HandCoins,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import CashReconciliation from './CashReconciliation';

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
  verifiedCashHandoffs: 0,
  verifiedCashHandoffCount: 0,
  pendingCashHandoffs: 0,
  pendingCashHandoffCount: 0,
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
    setLoading(true);
    try {
      const tomorrowDate = new Date(`${today}T00:00:00`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = toDateString(tomorrowDate);
      const [
        receiptsResult,
        disbursementsResult,
        cashHandoffsResult,
        loanPaymentsResult,
        savingsTransactionsResult,
        loanReleasesResult,
        savingsAccountsResult,
        activeLoansResult,
        accountRows
      ] = await Promise.all([
        supabase.from('cash_receipts')
          .select('id, receipt_date, receipt_number, received_from, description, amount, created_at, payment_method, account:chart_of_accounts(account_name)')
          .eq('status', 'recorded').eq('receipt_date', today).order('created_at', { ascending: false }),
        supabase.from('cash_disbursements')
          .select('id, disbursement_date, voucher_number, payee, description, amount, created_at')
          .eq('status', 'recorded').eq('disbursement_date', today).order('created_at', { ascending: false }),
        supabase.from('transaction_workflows')
          .select('business_record_id, amount, events:transaction_workflow_events(event_type)')
          .eq('direction', 'cash_in').eq('status', 'completed').eq('payment_method', 'cash')
          .gte('created_at', `${today}T00:00:00+08:00`)
          .lt('created_at', `${tomorrow}T00:00:00+08:00`),
        supabase.from('loan_payments').select('amount_paid, receipt_id')
          .eq('status', 'recorded').eq('payment_date', today),
        supabase.from('savings_transactions')
          .select('transaction_type, amount, receipt_id, disbursement_id, savings_accounts!inner(account_type)')
          .eq('status', 'recorded').eq('transaction_date', today),
        supabase.from('loans').select('principal_amount')
          .eq('release_date', today).neq('status', 'rejected'),
        supabase.from('savings_accounts').select('balance, account_type').eq('status', 'active'),
        supabase.from('loans').select('balance').eq('status', 'active'),
        fetchAccountBalances()
      ]);

      const failedResult = [
        receiptsResult,
        disbursementsResult,
        cashHandoffsResult,
        loanPaymentsResult,
        savingsTransactionsResult,
        loanReleasesResult,
        savingsAccountsResult,
        activeLoansResult
      ].find((result) => result.error);
      if (failedResult) throw failedResult.error;

      const receipts = receiptsResult.data || [];
      const disbursements = disbursementsResult.data || [];
      const cashOnHandReceiptIds = new Set(receipts
        .filter((receipt) => {
          const account = Array.isArray(receipt.account) ? receipt.account[0] : receipt.account;
          return receipt.payment_method === 'cash'
            && account?.account_name?.trim().toLowerCase() === 'cash on hand';
        })
        .map((receipt) => receipt.id));
      let handoffRecordToReceipt = new Map([...cashOnHandReceiptIds].map((receiptId) => [receiptId, receiptId]));
      if (cashOnHandReceiptIds.size) {
        const saleOrdersResult = await supabase.from('sales_orders')
          .select('id, cash_receipt_id')
          .in('cash_receipt_id', [...cashOnHandReceiptIds]);
        if (saleOrdersResult.error) throw saleOrdersResult.error;
        handoffRecordToReceipt = new Map([
          ...handoffRecordToReceipt,
          ...(saleOrdersResult.data || []).map((sale) => [sale.id, sale.cash_receipt_id])
        ]);
      }
      const cashHandoffs = (cashHandoffsResult.data || []).filter((workflow) => (
        handoffRecordToReceipt.has(workflow.business_record_id)
      ));
      const verifiedCashHandoffs = cashHandoffs.filter((workflow) => (
        (workflow.events || []).some((event) => event.event_type === 'cash_received_verified')
      ));
      const pendingCashHandoffs = cashHandoffs.filter((workflow) => (
        !(workflow.events || []).some((event) => event.event_type === 'cash_received_verified')
      ));
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
        verifiedCashHandoffs: sum(verifiedCashHandoffs, 'amount'),
        verifiedCashHandoffCount: verifiedCashHandoffs.length,
        pendingCashHandoffs: sum(pendingCashHandoffs, 'amount'),
        pendingCashHandoffCount: pendingCashHandoffs.length,
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
      setError(getDataLoadErrorMessage(loadError, 'treasury data'));
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
    'transaction_workflows',
    'transaction_workflow_events',
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
    { label: "Today's Bookkeeper-Recorded Receipts", value: displayAmount(data.todayCollections), icon: ArrowDownLeft, tone: 'green', detail: `${displayCount(data.collectionCount)} receipts · before handoff verification` },
    { label: "Today's Treasurer-Verified Handoffs", value: displayAmount(data.verifiedCashHandoffs), icon: ShieldCheck, tone: 'blue', detail: `${displayCount(data.verifiedCashHandoffCount)} verified · ${displayCount(data.pendingCashHandoffCount)} pending (${displayAmount(data.pendingCashHandoffs)})` },
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
      <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#063d46] via-[#087f83] to-[#20a9a2] p-6 text-white shadow-xl shadow-teal-950/20 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 -z-10 size-64 rounded-full border-[28px] border-white/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-1/3 -z-10 size-48 rounded-full bg-cyan-200/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-100">Treasury · Cash Control</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Daily Treasury Overview</h1>
            <p className="mt-2 text-sm leading-6 text-teal-50">
              Monitor cash custody, member transactions, and daily reconciliation from one place.
            </p>
            <p className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-teal-50">
              {new Date(`${today}T00:00:00`).toLocaleDateString('en-PH', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
          >
            <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh overview'}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/staff/cash-release" className="inline-flex min-h-10 items-center rounded-lg bg-gradient-to-r from-[#f3d37a] to-[#ffe8a6] px-4 py-2 text-sm font-bold text-teal-950 shadow-sm transition hover:brightness-105">
            Review cash release
          </Link>
          <Link to="/staff/savings" className="inline-flex min-h-10 items-center rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Member accounts
          </Link>
          <Link to="/staff/loan-collections" className="inline-flex min-h-10 items-center rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Loan collections
          </Link>
        </div>
      </section>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />

      <CashReconciliation />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard key={card.label} {...card} variant="treasurer" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 border-b border-slate-100 pb-3 text-lg font-semibold text-slate-900">Today's Bookkeeper-Recorded Receipts</h3>
          <div className="space-y-3">
            {renderBreakdown(data.collectionBreakdown, 'No recorded receipts today.', 'bg-green-600')}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="font-bold text-gray-900">Total receipts recorded</span>
              <span className="text-lg font-bold text-green-600">{displayAmount(data.todayCollections)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 border-b border-slate-100 pb-3 text-lg font-semibold text-slate-900">Today's Cash Disbursements</h3>
          <div className="space-y-3">
            {renderBreakdown(data.disbursementBreakdown, 'No recorded disbursements today.', 'bg-red-600')}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="font-bold text-gray-900">Total Cash Released</span>
              <span className="text-lg font-bold text-red-600">{displayAmount(data.todayDisbursements)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 border-b border-slate-100 pb-3 text-lg font-semibold text-slate-900">Today's Transaction Counts</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[
            ['Loan payments', data.loanPaymentCount, data.todayLoanPayments],
            ['Loan releases', data.loanReleaseCount, data.todayLoanReleases],
            ['Savings deposits', data.savingsDepositCount, data.todaySavingsDeposits],
            ['Savings withdrawals', data.savingsWithdrawalCount, data.todaySavingsWithdrawals],
            ['Time deposit transactions', data.timeDepositTransactionCount, data.todayTimeDepositTransactions]
          ].map(([label, count, amount]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
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
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-gray-950">Account Balances</h3>
          </div>
          <div className="space-y-3">
            {[
              {
                label: 'Savings and time deposits',
                detail: 'Member deposits',
                amount: data.totalSavingsBalance + data.totalTimeDepositBalance,
                icon: Landmark,
                tone: 'bg-emerald-50 text-emerald-700'
              },
              {
                label: 'Active loan balance',
                detail: 'Outstanding loans',
                amount: data.totalLoanBalance,
                icon: HandCoins,
                tone: 'bg-blue-50 text-blue-700'
              },
              {
                label: 'Cash on hand',
                detail: 'Current ledger balance',
                amount: data.cashOnHand,
                icon: Wallet,
                tone: 'bg-violet-50 text-violet-700'
              }
            ].map((account) => {
              const Icon = account.icon;
              return (
                <div key={account.label} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/70 p-4">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${account.tone}`}>
                    <Icon aria-hidden="true" size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{account.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{account.detail}</p>
                  </div>
                  <p className="text-right text-lg font-semibold tabular-nums text-gray-950 sm:text-xl">
                    {displayAmount(account.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-950">Net Cash Flow</h3>
            </div>
            <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">Today</span>
          </div>
          {!hasData && loading ? (
            <p className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">Loading cash-flow data…</p>
          ) : !hasData ? (
            <p className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">Cash-flow data is unavailable.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <ArrowDownLeft aria-hidden="true" size={17} />
                    <p className="text-sm font-medium">Cash received</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-950">{formatMoney(data.todayCollections)}</p>
                  <p className="mt-1 text-xs text-gray-500">{data.collectionCount.toLocaleString()} receipts</p>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-4">
                  <div className="flex items-center gap-2 text-rose-700">
                    <ArrowUpFromLine aria-hidden="true" size={17} />
                    <p className="text-sm font-medium">Cash released</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-950">{formatMoney(data.todayDisbursements)}</p>
                  <p className="mt-1 text-xs text-gray-500">{data.disbursementCount.toLocaleString()} disbursements</p>
                </div>
              </div>
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${totalCashFlow >= 0 ? 'border-teal-100 bg-teal-50' : 'border-amber-100 bg-amber-50'}`}>
                <div>
                  <p className="text-sm font-medium text-gray-700">Net flow</p>
                </div>
                <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${totalCashFlow >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
                  {totalCashFlow >= 0 ? '+' : '−'}{formatMoney(Math.abs(totalCashFlow))}
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

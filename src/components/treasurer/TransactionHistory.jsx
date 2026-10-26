import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const transactionTypes = [
  'Loan Payment',
  'Other Disbursement',
  'Other Receipt',
  'Savings Deposit',
  'Savings Withdrawal',
  'Time Deposit',
  'Time Deposit Withdrawal'
];
const initialEndDate = toDateString(new Date());
const initialStart = new Date(`${initialEndDate}T00:00:00`);
initialStart.setDate(initialStart.getDate() - 29);
const initialStartDate = toDateString(initialStart);

const getAccountType = (transaction) => {
  const accounts = transaction.savings_accounts;
  return Array.isArray(accounts) ? accounts[0]?.account_type : accounts?.account_type;
};

const TransactionHistory = () => {
  const [filters, setFilters] = useState({
    type: '',
    search: '',
    dateFrom: initialStartDate,
    dateTo: initialEndDate
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadTransactions = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setTransactions([]);
      setError('Start date must be before or equal to end date.');
      setLoading(false);
      return;
    }

    try {
      let receiptsQuery = supabase.from('cash_receipts')
        .select('id, receipt_number, receipt_date, received_from, description, amount, created_at')
        .eq('status', 'recorded').order('receipt_date', { ascending: false }).limit(250);
      let disbursementsQuery = supabase.from('cash_disbursements')
        .select('id, voucher_number, disbursement_date, payee, description, amount, created_at')
        .eq('status', 'recorded').order('disbursement_date', { ascending: false }).limit(250);

      if (filters.dateFrom) {
        receiptsQuery = receiptsQuery.gte('receipt_date', filters.dateFrom);
        disbursementsQuery = disbursementsQuery.gte('disbursement_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        receiptsQuery = receiptsQuery.lte('receipt_date', filters.dateTo);
        disbursementsQuery = disbursementsQuery.lte('disbursement_date', filters.dateTo);
      }

      const [receiptsResult, disbursementsResult] = await Promise.all([
        receiptsQuery,
        disbursementsQuery
      ]);
      const failed = [receiptsResult, disbursementsResult].find((result) => result.error);
      if (failed) throw failed.error;

      const receipts = receiptsResult.data || [];
      const disbursements = disbursementsResult.data || [];
      const receiptIds = receipts.map((receipt) => receipt.id);
      const disbursementIds = disbursements.map((disbursement) => disbursement.id);
      const [paymentsResult, receiptSavingsResult, disbursementSavingsResult] = await Promise.all([
        receiptIds.length
          ? supabase.from('loan_payments').select('receipt_id').in('receipt_id', receiptIds)
          : Promise.resolve({ data: [], error: null }),
        receiptIds.length
          ? supabase.from('savings_transactions')
            .select('receipt_id, transaction_type, savings_accounts!inner(account_type)')
            .in('receipt_id', receiptIds)
          : Promise.resolve({ data: [], error: null }),
        disbursementIds.length
          ? supabase.from('savings_transactions')
            .select('disbursement_id, transaction_type, savings_accounts!inner(account_type)')
            .in('disbursement_id', disbursementIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      const associationError = [paymentsResult, receiptSavingsResult, disbursementSavingsResult]
        .find((result) => result.error);
      if (associationError) throw associationError.error;

      const receiptCategory = new Map();
      const disbursementCategory = new Map();
      (paymentsResult.data || []).forEach((payment) => {
        if (payment.receipt_id) receiptCategory.set(payment.receipt_id, 'Loan Payment');
      });
      (receiptSavingsResult.data || []).forEach((transaction) => {
        const accountType = getAccountType(transaction);
        if (transaction.receipt_id && transaction.transaction_type === 'deposit') {
          receiptCategory.set(transaction.receipt_id, accountType === 'time_deposit' ? 'Time Deposit' : 'Savings Deposit');
        }
      });
      (disbursementSavingsResult.data || []).forEach((transaction) => {
        const accountType = getAccountType(transaction);
        if (transaction.disbursement_id && transaction.transaction_type === 'withdrawal') {
          disbursementCategory.set(
            transaction.disbursement_id,
            accountType === 'time_deposit' ? 'Time Deposit Withdrawal' : 'Savings Withdrawal'
          );
        }
      });

      const rows = [
        ...receipts.map((receipt) => ({
          id: `receipt-${receipt.id}`,
          date: receipt.receipt_date,
          timestamp: receipt.created_at,
          reference: receipt.receipt_number,
          type: receiptCategory.get(receipt.id) || 'Other Receipt',
          direction: 'received',
          counterparty: receipt.received_from,
          description: receipt.description,
          amount: Number(receipt.amount || 0)
        })),
        ...disbursements.map((disbursement) => ({
          id: `disbursement-${disbursement.id}`,
          date: disbursement.disbursement_date,
          timestamp: disbursement.created_at,
          reference: disbursement.voucher_number,
          type: disbursementCategory.get(disbursement.id) || 'Other Disbursement',
          direction: 'released',
          counterparty: disbursement.payee,
          description: disbursement.description,
          amount: Number(disbursement.amount || 0)
        }))
      ].sort((left, right) => {
        const dateOrder = right.date.localeCompare(left.date);
        return dateOrder || new Date(right.timestamp) - new Date(left.timestamp);
      });

      if (currentRequest !== requestId.current) return;
      setTransactions(rows);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load treasurer transaction history:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'transaction history'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    loadTransactions();
    return () => {
      requestId.current += 1;
    };
  }, [loadTransactions]);

  useMultipleRealtimeSubscriptions([
    'cash_receipts', 'cash_disbursements', 'loan_payments', 'savings_transactions', 'savings_accounts'
  ].map((table) => ({ table, onUpdate: loadTransactions })), [loadTransactions]);

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    if (filters.type && transaction.type !== filters.type) return false;
    const search = filters.search.trim().toLocaleLowerCase();
    return !search || [
      transaction.reference,
      transaction.counterparty,
      transaction.description,
      transaction.type
    ].some((value) => value?.toLocaleLowerCase().includes(search));
  }), [filters.search, filters.type, transactions]);

  const totals = filteredTransactions.reduce((result, transaction) => {
    if (transaction.direction === 'received') result.received += transaction.amount;
    else result.released += transaction.amount;
    return result;
  }, { received: 0, released: 0 });
  const netFlow = totals.received - totals.released;
  const types = [...new Set([
    ...transactionTypes,
    ...transactions.map((transaction) => transaction.type)
  ])].sort();

  const exportCsv = () => {
    const rows = [
      ['Date', 'Reference', 'Type', 'Direction', 'Counterparty', 'Description', 'Amount'],
      ...filteredTransactions.map((transaction) => [
        transaction.date,
        transaction.reference,
        transaction.type,
        transaction.direction,
        transaction.counterparty,
        transaction.description,
        transaction.amount.toFixed(2)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `treasurer-transactions-${filters.dateFrom || 'all'}-to-${filters.dateTo || 'all'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => setFilters({
    type: '',
    search: '',
    dateFrom: initialStartDate,
    dateTo: initialEndDate
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-gray-900">Transaction History</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-gray-700">
            Transaction type
            <select
              value={filters.type}
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            >
              <option value="">All types</option>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Search records
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Reference, counterparty, description"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            From
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => {
                setLoading(true);
                setFilters((current) => ({ ...current, dateFrom: event.target.value }));
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            To
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => {
                setLoading(true);
                setFilters((current) => ({ ...current, dateTo: event.target.value }));
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset filters
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || filteredTransactions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ['Cash received', totals.received, 'text-green-700'],
          ['Cash released', totals.released, 'text-red-700'],
          ['Net cash flow', netFlow, netFlow >= 0 ? 'text-teal-700' : 'text-red-700']
        ].map(([label, amount, color]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>
              {loading ? 'Loading…' : error ? 'Unavailable' : formatMoney(amount)}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Cash book entries</h3>
            <p className="mt-1 text-sm text-gray-500">
              {loading ? 'Loading records…' : `${filteredTransactions.length} ${filteredTransactions.length === 1 ? 'entry' : 'entries'}`}
            </p>
          </div>
          {transactions.length >= 500 && <p className="text-xs text-amber-700">Record limit reached; narrow the date range to see complete results.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-5 py-3">Date</th>
                <th scope="col" className="px-5 py-3">Reference</th>
                <th scope="col" className="px-5 py-3">Type</th>
                <th scope="col" className="px-5 py-3">Counterparty</th>
                <th scope="col" className="px-5 py-3">Direction</th>
                <th scope="col" className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-500">Loading transactions…</td></tr>
              ) : error ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-500">Transaction records are unavailable.</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-500">No recorded transactions match these filters.</td></tr>
              ) : filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">{transaction.date}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-700">{transaction.reference}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900">{transaction.type}</td>
                  <td className="px-5 py-3 text-gray-700">{transaction.counterparty || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      transaction.direction === 'received' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {transaction.direction === 'received' ? 'Received' : 'Released'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums text-gray-900">{formatMoney(transaction.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default TransactionHistory;

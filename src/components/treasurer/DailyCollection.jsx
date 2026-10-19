import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const getAccountType = (transaction) => {
  const accounts = transaction.savings_accounts;
  return Array.isArray(accounts) ? accounts[0]?.account_type : accounts?.account_type;
};

const DailyCollection = () => {
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadCollections = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const [receiptsResult, paymentsResult, savingsResult] = await Promise.all([
        supabase.from('cash_receipts')
          .select('id, receipt_number, receipt_date, received_from, description, amount, created_at, status')
          .eq('status', 'recorded').eq('receipt_date', selectedDate)
          .order('created_at', { ascending: false }),
        supabase.from('loan_payments')
          .select('receipt_id')
          .eq('payment_date', selectedDate),
        supabase.from('savings_transactions')
          .select('receipt_id, transaction_type, savings_accounts!inner(account_type)')
          .eq('transaction_date', selectedDate)
      ]);
      const failed = [receiptsResult, paymentsResult, savingsResult].find((result) => result.error);
      if (failed) throw failed.error;

      const categoryByReceipt = new Map();
      (paymentsResult.data || []).forEach((payment) => {
        if (payment.receipt_id) categoryByReceipt.set(payment.receipt_id, 'Loan Payment');
      });
      (savingsResult.data || []).forEach((transaction) => {
        if (transaction.receipt_id && transaction.transaction_type === 'deposit') {
          categoryByReceipt.set(
            transaction.receipt_id,
            getAccountType(transaction) === 'time_deposit' ? 'Time Deposit' : 'Savings Deposit'
          );
        }
      });
      const rows = (receiptsResult.data || []).map((receipt) => ({
        id: receipt.id,
        time: receipt.created_at
          ? new Date(receipt.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
          : '',
        type: categoryByReceipt.get(receipt.id) || 'Other Receipt',
        member: receipt.received_from,
        description: receipt.description,
        reference: receipt.receipt_number,
        amount: Number(receipt.amount || 0),
        createdAt: receipt.created_at
      }));

      if (currentRequest !== requestId.current) return;
      setCollections(rows);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load daily collections:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'collection data'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadCollections();
    return () => {
      requestId.current += 1;
    };
  }, [loadCollections]);

  useMultipleRealtimeSubscriptions([
    'cash_receipts', 'loan_payments', 'savings_transactions', 'savings_accounts'
  ].map((table) => ({ table, onUpdate: loadCollections })), [loadCollections]);

  const breakdown = useMemo(() => {
    const totals = new Map();
    collections.forEach((collection) => {
      const current = totals.get(collection.type) || { category: collection.type, amount: 0, count: 0 };
      current.amount += collection.amount;
      current.count += 1;
      totals.set(collection.type, current);
    });
    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount);
  }, [collections]);
  const totalCollections = collections.reduce((total, row) => total + row.amount, 0);
  const totalTransactions = collections.length;

  const exportCsv = () => {
    const rows = [
      ['Date', 'Time', 'Category', 'Received From', 'Description', 'Receipt Number', 'Amount'],
      ...collections.map((collection) => [
        selectedDate,
        collection.time,
        collection.type,
        collection.member,
        collection.description,
        collection.reference,
        collection.amount.toFixed(2)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `daily-collections-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleDateChange = (event) => {
    if (event.target.value) {
      setLoading(true);
      setError('');
      setSelectedDate(event.target.value);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Daily Collections</h2>
          <p className="mt-1 text-sm text-gray-500">Recorded cash receipts for the selected date.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Link
            to="/staff/cash-disbursements"
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Record a transaction
          </Link>
          <label className="text-sm font-medium text-gray-700">
            Collection date
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer size={16} aria-hidden="true" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || collections.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total cash received</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {loading ? 'Loading…' : error ? 'Unavailable' : formatMoney(totalCollections)}
          </p>
          <p className="mt-2 text-sm text-gray-500">{selectedDate}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Recorded receipts</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {loading ? '…' : error ? '—' : totalTransactions.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-gray-500">For the selected date</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-900">Collection breakdown</h3>
          <p className="mt-1 text-sm text-gray-500">Categories are matched to linked loan and savings transactions.</p>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading collection data…</p>
        ) : !error && breakdown.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No recorded receipts for this date.</p>
        ) : !error ? (
          <div className="divide-y divide-gray-100">
            {breakdown.map((item) => (
              <div key={item.category} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-medium text-gray-900">{item.category}</p>
                  <p className="mt-1 text-sm text-gray-500">{item.count} {item.count === 1 ? 'receipt' : 'receipts'}</p>
                </div>
                <p className="font-semibold tabular-nums text-gray-900">{formatMoney(item.amount)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Receipt details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-5 py-3">Time</th>
                <th scope="col" className="px-5 py-3">Category</th>
                <th scope="col" className="px-5 py-3">Received from</th>
                <th scope="col" className="px-5 py-3">Reference</th>
                <th scope="col" className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="5" className="px-5 py-10 text-center text-gray-500">Loading receipts…</td></tr>
              ) : error ? (
                <tr><td colSpan="5" className="px-5 py-10 text-center text-gray-500">Receipt data is unavailable.</td></tr>
              ) : collections.length === 0 ? (
                <tr><td colSpan="5" className="px-5 py-10 text-center text-gray-500">No receipts for this date.</td></tr>
              ) : collections.map((collection) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-5 py-3 text-gray-600">{collection.time || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900">{collection.type}</td>
                  <td className="px-5 py-3 text-gray-700">{collection.member || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-600">{collection.reference || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums text-gray-900">{formatMoney(collection.amount)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && !error && collections.length > 0 && (
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan="4" className="px-5 py-3 font-semibold text-gray-900">Total</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900">{formatMoney(totalCollections)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
};

export default DailyCollection;

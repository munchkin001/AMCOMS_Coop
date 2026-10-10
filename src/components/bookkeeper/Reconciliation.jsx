import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const CASH_ACCOUNTS = ['Cash on Hand', 'Cash in Bank'];
const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const localDate = (date = new Date()) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
};
const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row) || 0), 0);
const same = (a, b) => Math.abs(a - b) < 0.01;

const emptyDay = () => ({
  receipts: 0, receiptCount: 0, disbursements: 0, disbursementCount: 0,
  ledgerDebits: 0, ledgerCredits: 0, journalCount: 0,
  loanReceipts: 0, loanPayments: 0, loansDisbursed: 0, loansReleased: 0, unbalanced: 0
});

const rowsFor = (d) => [
  { label: 'Cash received', books: d.receipts, ledger: d.ledgerDebits, tone: 'text-green-600' },
  { label: 'Cash disbursed', books: d.disbursements, ledger: d.ledgerCredits, tone: 'text-red-600' },
  { label: 'Loan payments received', books: d.loanReceipts, ledger: d.loanPayments, tone: 'text-gray-900' },
  { label: 'Loans released', books: d.loansDisbursed, ledger: d.loansReleased, tone: 'text-gray-900' },
  { label: 'Entries recorded', books: d.receiptCount + d.disbursementCount, ledger: d.journalCount, count: true, tone: 'text-gray-900' }
];

const badge = (ok) => (
  <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
    {ok ? 'Match' : 'Difference'}
  </span>
);

const Reconciliation = () => {
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [days, setDays] = useState({});
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState(null);

  const load = useCallback(async () => {
    const from = shiftDate(selectedDate, -6);
    const [receiptsRes, disbursementsRes, journalRes, paymentsRes, loansRes] = await Promise.all([
      supabase.from('cash_receipts')
        .select('id, receipt_date, amount, status, lines:cash_receipt_lines(amount, side, account:chart_of_accounts(account_name))')
        .gte('receipt_date', from).lte('receipt_date', selectedDate),
      supabase.from('cash_disbursements')
        .select('id, disbursement_date, amount, status, lines:cash_disbursement_lines(amount, account:chart_of_accounts(account_name))')
        .gte('disbursement_date', from).lte('disbursement_date', selectedDate),
      supabase.from('journal_entries')
        .select('id, entry_date, status, lines:journal_entry_lines(debit_amount, credit_amount, account:chart_of_accounts(account_name))')
        .eq('status', 'posted')
        .is('reversed_by_entry_id', null)
        .neq('entry_type', 'reversing')
        .gte('entry_date', from).lte('entry_date', selectedDate),
      supabase.from('loan_payments').select('id, payment_date, amount_paid, receipt_id')
        .gte('payment_date', from).lte('payment_date', selectedDate),
      supabase.from('loans').select('id, release_date, principal_amount, status')
        .gte('release_date', from).lte('release_date', selectedDate).neq('status', 'rejected')
    ]);

    const failed = [receiptsRes, disbursementsRes, journalRes, paymentsRes, loansRes].find((res) => res.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }
    setError('');

    const result = {};
    const day = (key) => (result[key] = result[key] || emptyDay());

    let drafts = 0;
    (receiptsRes.data || []).forEach((receipt) => {
      if (receipt.status !== 'recorded') { drafts += 1; return; }
      const d = day(receipt.receipt_date);
      d.receipts += Number(receipt.amount);
      d.receiptCount += 1;
      d.loanReceipts += sum(
        (receipt.lines || []).filter((line) => line.side === 'credit' && line.account?.account_name === 'Loan Receivable'),
        (line) => line.amount
      );
    });
    (disbursementsRes.data || []).forEach((disbursement) => {
      if (disbursement.status !== 'recorded') { drafts += 1; return; }
      const d = day(disbursement.disbursement_date);
      d.disbursements += Number(disbursement.amount);
      d.disbursementCount += 1;
      d.loansDisbursed += sum(
        (disbursement.lines || []).filter((line) => line.account?.account_name === 'Loan Payable' || line.account?.account_name === 'Loan Receivable'),
        (line) => line.amount
      );
    });
    (journalRes.data || []).forEach((entry) => {
      const d = day(entry.entry_date);
      const lines = entry.lines || [];
      d.journalCount += 1;
      lines.filter((line) => CASH_ACCOUNTS.includes(line.account?.account_name)).forEach((line) => {
        d.ledgerDebits += Number(line.debit_amount);
        d.ledgerCredits += Number(line.credit_amount);
      });
      if (!same(sum(lines, (line) => line.debit_amount), sum(lines, (line) => line.credit_amount))) d.unbalanced += 1;
    });
    (paymentsRes.data || []).forEach((payment) => { day(payment.payment_date).loanPayments += Number(payment.amount_paid); });
    (loansRes.data || []).forEach((loan) => { day(loan.release_date).loansReleased += Number(loan.principal_amount); });

    setDays(result);
    setDraftCount(drafts);
    setLastRun(new Date());
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'cash_receipts', onUpdate: load },
    { table: 'cash_receipt_lines', onUpdate: load },
    { table: 'cash_disbursements', onUpdate: load },
    { table: 'cash_disbursement_lines', onUpdate: load },
    { table: 'journal_entries', onUpdate: load },
    { table: 'journal_entry_lines', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'loans', onUpdate: load }
  ], [load]);

  const today = days[selectedDate] || emptyDay();
  const rows = rowsFor(today);
  const mismatches = rows.filter((row) => !same(row.books, row.ledger)).length + (today.unbalanced ? 1 : 0);
  const isMatched = mismatches === 0;
  const netBooks = today.receipts - today.disbursements;
  const netLedger = today.ledgerDebits - today.ledgerCredits;

  const history = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const key = shiftDate(selectedDate, -i);
    const d = days[key] || emptyDay();
    const dayRows = rowsFor(d);
    const diff = dayRows.filter((row) => !row.count).reduce((total, row) => total + Math.abs(row.books - row.ledger), 0);
    const bad = dayRows.some((row) => !same(row.books, row.ledger)) || d.unbalanced > 0;
    const empty = d.receiptCount + d.disbursementCount + d.journalCount === 0;
    return { key, d, diff, bad, empty };
  }), [days, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setLoading(true); load(); }}
              className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700"
            >
              Run Reconciliation
            </button>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Live - rechecks automatically whenever a transaction, journal entry or loan changes
          {lastRun && ` (last checked ${lastRun.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' })})`}
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-500">Reconciling records...</p>
      ) : (
        <>
          <div className={`rounded-lg border-2 p-6 shadow ${isMatched ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <h3 className={`text-2xl font-bold ${isMatched ? 'text-green-800' : 'text-red-800'}`}>
              {isMatched ? 'Records Match' : 'Discrepancy Found'}
            </h3>
            <p className={`mt-1 text-sm ${isMatched ? 'text-green-700' : 'text-red-700'}`}>
              {isMatched
                ? today.receiptCount + today.disbursementCount === 0
                  ? 'No recorded transactions on this date. Nothing to reconcile.'
                  : 'Cash books, general ledger and member loan records agree.'
                : `${mismatches} item${mismatches === 1 ? '' : 's'} do not agree. Review the rows marked Difference below.`}
            </p>
            {draftCount > 0 && (
              <p className="mt-2 text-xs text-gray-600">{draftCount} draft transaction{draftCount === 1 ? '' : 's'} in this period are excluded until recorded.</p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Record Comparison</h3>
              <p className="mt-1 text-sm text-gray-600">Date: {selectedDate}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Cash Books</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Ledger / Member Records</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Difference</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-gray-200">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.label}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${row.tone}`}>{row.count ? row.books : peso(row.books)}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${row.tone}`}>{row.count ? row.ledger : peso(row.ledger)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {same(row.books, row.ledger) ? '-' : row.count ? Math.abs(row.books - row.ledger) : peso(Math.abs(row.books - row.ledger))}
                      </td>
                      <td className="px-4 py-3 text-center">{badge(same(row.books, row.ledger))}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-200 bg-purple-50">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">Net cash movement</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">{peso(netBooks)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">{peso(netLedger)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{same(netBooks, netLedger) ? '-' : peso(Math.abs(netBooks - netLedger))}</td>
                    <td className="px-4 py-3 text-center">{badge(same(netBooks, netLedger))}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Unbalanced journal entries</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500" colSpan={3}>
                      {today.unbalanced ? `${today.unbalanced} with unequal debits and credits` : 'None'}
                    </td>
                    <td className="px-4 py-3 text-center">{badge(today.unbalanced === 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Reconciliation History (7 days)</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Received</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Disbursed</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Difference</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.key} onClick={() => setSelectedDate(item.key)} className="cursor-pointer border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.key}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{peso(item.d.receipts)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{peso(item.d.disbursements)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{item.diff > 0 ? peso(item.diff) : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {item.empty ? (
                          <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">No activity</span>
                        ) : badge(!item.bad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
            <h4 className="mb-2 font-semibold text-blue-900">How this is reconciled</h4>
            <p className="text-sm text-blue-800">
              Recorded cash receipts and disbursements are compared with the cash accounts in the posted general ledger. Loan payments and
              released loans are compared with the member loan records. Any record that was deleted, changed or posted incorrectly shows
              as a difference immediately.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default Reconciliation;

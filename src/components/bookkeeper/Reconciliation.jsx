import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import {
  emptyReconciliationDay,
  loadReconciliationDays,
  localDate,
  reconciliationRows,
  sameReconciliationValue,
  shiftDate,
} from '../../lib/dailyReconciliation';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const same = sameReconciliationValue;
const rowsFor = (day) => reconciliationRows(day).map((row) => ({
  ...row,
  tone: row.label === 'Cash received'
    ? 'text-green-600'
    : row.label === 'Cash disbursed'
      ? 'text-red-600'
      : 'text-gray-900',
}));

const badge = (ok) => (
  <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
    {ok ? 'Match' : 'Difference'}
  </span>
);

const getDetailSections = (row, day) => {
  if (row.label === 'Cash received') {
    return [
      { title: 'Recorded cash receipts', records: day.receiptRecords },
      { title: 'Posted journals affecting cash', records: day.cashJournalEntries.filter((entry) => entry.cashDebit > 0) },
    ];
  }
  if (row.label === 'Cash disbursed') {
    return [
      { title: 'Recorded cash disbursements', records: day.disbursementRecords },
      { title: 'Posted journals affecting cash', records: day.cashJournalEntries.filter((entry) => entry.cashCredit > 0) },
    ];
  }
  if (row.label === 'Loan principal applied') {
    return [
      { title: 'Loan principal on cash receipts', records: day.loanReceiptRecords },
      { title: 'Recorded member loan payments', records: day.loanPaymentRecords },
    ];
  }
  if (row.label === 'Loans released') {
    return [
      { title: 'Loan amounts in disbursements', records: day.loanDisbursementRecords },
      { title: 'Recorded loan releases', records: day.loanReleaseRecords },
    ];
  }
  return [
    { title: 'Cash-book records', records: [...day.receiptRecords, ...day.disbursementRecords] },
    { title: 'Cash receipt/disbursement journal entries counted above', records: day.cashJournalEntries },
    {
      title: 'Other posted journals (not cash-book entries)',
      records: day.journalEntries.filter((entry) => !entry.isCashBookEntry),
      note: 'These can include valid entries such as cost of goods sold. They are shown for context but are not counted as cash receipts or disbursements.',
    },
  ];
};

const ReconciliationDetails = ({ row, day, date, onBack }) => {
  const sections = getDetailSections(row, day);
  const mismatched = !same(row.books, row.ledger);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-purple-900 shadow-sm transition hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to reconciliation
      </button>

      <header className="overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#28134b] via-[#63349c] to-[#985dd0] px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-100">Reconciliation detail · {date}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{row.label}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-purple-100">
                Review the source records and corresponding ledger or member records used to calculate this comparison.
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
              mismatched ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}>
              {mismatched
                ? <AlertTriangle size={17} aria-hidden="true" />
                : <CheckCircle2 size={17} aria-hidden="true" />}
              {mismatched ? 'Difference to review' : 'Totals match'}
            </span>
          </div>
        </div>

        <div className="grid gap-px bg-purple-100 sm:grid-cols-3">
          <div className="bg-white p-5 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Cash books / source records</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{row.count ? row.books : peso(row.books)}</p>
          </div>
          <div className="bg-white p-5 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Ledger / member records</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{row.count ? row.ledger : peso(row.ledger)}</p>
          </div>
          <div className="bg-white p-5 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Difference</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${mismatched ? 'text-red-700' : 'text-green-700'}`}>
              {mismatched ? row.count ? Math.abs(row.books - row.ledger) : peso(Math.abs(row.books - row.ledger)) : row.count ? '0' : peso(0)}
            </p>
          </div>
        </div>
      </header>

      <section className={`rounded-xl border p-5 sm:p-6 ${
        mismatched ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'
      }`}>
        <h2 className={`text-base font-bold ${mismatched ? 'text-amber-950' : 'text-blue-950'}`}>
          {mismatched ? 'What to review' : 'How to read this detail'}
        </h2>
        <p className={`mt-2 text-sm leading-6 ${mismatched ? 'text-amber-900' : 'text-blue-900'}`}>
          {mismatched
            ? row.count
              ? 'The source-record count and cash receipt/disbursement journal count differ. Compare the references below and check for a missing or duplicate CR/CD journal entry. Do not create a balancing entry solely to force the counts to match.'
              : 'Compare the source amounts with their posted cash or member records below. Correct the originating transaction through its normal accounting workflow; do not edit totals solely to force a match.'
            : 'The totals shown here agree for this date. The records below are the underlying entries included in each side of the comparison.'}
        </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {sections.map((section, index) => (
          <section key={section.title} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-gray-900">{section.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {section.records.length} record{section.records.length === 1 ? '' : 's'} · {date}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  mismatched && index === 1 ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-900'
                }`}>
                  {section.records.length}
                </span>
              </div>
              {section.note && <p className="mt-3 text-sm leading-5 text-gray-600">{section.note}</p>}
            </div>
            {section.records.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">No records for this category on this date.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {section.records.map((record) => (
                  <li key={record.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-gray-900">{record.description}</p>
                        <p className="mt-1 break-all text-sm font-medium text-purple-800">{record.reference || 'No reference'}</p>
                        <p className="mt-1 text-xs text-gray-500">{record.date}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold tabular-nums text-gray-900">
                        {record.isCashBookEntry === undefined ? peso(record.amount) : `Cash debit ${peso(record.cashDebit)} · credit ${peso(record.cashCredit)}`}
                      </p>
                    </div>
                    {record.lines?.length > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full min-w-[380px] text-sm">
                          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                            <tr>
                              <th className="px-3 py-2 text-left">Account</th>
                              <th className="px-3 py-2 text-right">Debit</th>
                              <th className="px-3 py-2 text-right">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {record.lines.map((line, lineIndex) => (
                              <tr key={`${record.id}-${line.account}-${lineIndex}`}>
                                <td className="px-3 py-2 font-medium text-gray-800">{line.account}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{peso(line.debit)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{peso(line.credit)}</td>
                              </tr>
                            ))}
                          </tbody>
                          {record.isCashBookEntry === false && (
                            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
                              <tr>
                                <td className="px-3 py-2">Journal totals</td>
                                <td className="px-3 py-2 text-right tabular-nums">{peso(record.debitTotal)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{peso(record.creditTotal)}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg bg-purple-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-purple-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Return to reconciliation
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
};

const Reconciliation = () => {
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [days, setDays] = useState({});
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState(null);
  const [selectedDetailLabel, setSelectedDetailLabel] = useState(null);

  const load = useCallback(async () => {
    try {
      const { days: result, draftCount: drafts } = await loadReconciliationDays(selectedDate);
      setDays(result);
      setDraftCount(drafts);
      setError('');
      setLastRun(new Date());
      setLoading(false);
    } catch (loadError) {
      setError(getDataLoadErrorMessage(loadError, 'reconciliation data'));
      setLoading(false);
    }
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

  const today = days[selectedDate] || emptyReconciliationDay();
  const rows = rowsFor(today);
  const selectedDetailRow = rows.find((row) => row.label === selectedDetailLabel);
  const mismatches = rows.filter((row) => !same(row.books, row.ledger)).length + (today.unbalanced ? 1 : 0);
  const isMatched = mismatches === 0;
  const netBooks = today.receipts - today.disbursements;
  const netLedger = today.ledgerDebits - today.ledgerCredits;

  const history = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const key = shiftDate(selectedDate, -i);
    const d = days[key] || emptyReconciliationDay();
    const dayRows = rowsFor(d);
    const diff = dayRows.filter((row) => !row.count).reduce((total, row) => total + Math.abs(row.books - row.ledger), 0);
    const bad = dayRows.some((row) => !same(row.books, row.ledger)) || d.unbalanced > 0;
    const empty = d.receiptCount + d.disbursementCount + d.journalCount === 0;
    return { key, d, diff, bad, empty };
  }), [days, selectedDate]);

  if (selectedDetailRow) {
    return (
      <ReconciliationDetails
        row={selectedDetailRow}
        day={today}
        date={selectedDate}
        onBack={() => setSelectedDetailLabel(null)}
      />
    );
  }

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
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailLabel(row.label)}
                          aria-label={`Open ${row.label} reconciliation details for ${selectedDate}`}
                          className="group inline-flex items-center gap-2 rounded text-left text-purple-900 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                        >
                          <span className="underline decoration-purple-200 underline-offset-4 group-hover:decoration-purple-500">{row.label}</span>
                          <ArrowRight size={15} className="text-purple-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </button>
                        {row.detail && <span className="mt-0.5 block text-xs font-normal text-gray-500">{row.detail}</span>}
                      </td>
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
              released loans are compared with the member loan records. The loan principal check compares only the amount credited to Loan
              Receivable with the principal recorded against the member's loan. Interest and penalties are excluded from that check; they
              remain part of the total cash receipt and are recorded to their own accounts. Any record that was deleted, changed or posted
              incorrectly shows as a difference immediately.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default Reconciliation;

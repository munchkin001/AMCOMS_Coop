import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

const ReconciliationDetails = ({ row, day, date }) => {
  const sections = getDetailSections(row, day);
  const mismatched = !same(row.books, row.ledger);

  return (
    <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50/60 p-4">
      <div>
        <h4 className="font-semibold text-gray-900">{row.label} history for {date}</h4>
        <p className="mt-1 text-sm text-gray-700">
          {mismatched
            ? row.count
              ? 'The number of source records and matching cash-book journal entries differs. Check for a missing or duplicate CR/CD journal entry.'
              : 'Compare each source record with its posted cash journal lines. Correct the source transaction through the normal accounting workflow; do not adjust totals just to force a match.'
            : 'The totals match. Review the underlying records and journal details below.'}
        </p>
      </div>
      {sections.map((section) => (
        <section key={section.title}>
          <h5 className="text-sm font-semibold text-gray-800">{section.title} ({section.records.length})</h5>
          {section.note && <p className="mt-1 text-xs text-gray-600">{section.note}</p>}
          {section.records.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No records for this category on this date.</p>
          ) : (
            <ul className="mt-2 divide-y divide-purple-100 rounded-lg border border-purple-100 bg-white">
              {section.records.map((record) => (
                <li key={record.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {record.reference || 'No reference'} · {record.description}
                      </p>
                      <p className="text-xs text-gray-500">{record.date}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-gray-900">
                      {record.isCashBookEntry === undefined ? peso(record.amount) : `Cash debit ${peso(record.cashDebit)} · credit ${peso(record.cashCredit)}`}
                    </p>
                  </div>
                  {record.lines?.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-purple-100 pl-3 text-xs text-gray-600">
                      {record.lines.map((line, index) => (
                        <li key={`${record.id}-${line.account}-${index}`} className="flex flex-wrap justify-between gap-x-4">
                          <span>{line.account}</span>
                          <span>Debit {peso(line.debit)} · Credit {peso(line.credit)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {record.isCashBookEntry === false && (
                    <p className="mt-2 text-xs text-gray-600">
                      Journal totals: debit {peso(record.debitTotal)} · credit {peso(record.creditTotal)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
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
  const [expandedRow, setExpandedRow] = useState(null);

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
                  {rows.map((row) => {
                    const isExpanded = expandedRow === row.label;
                    return (
                      <React.Fragment key={row.label}>
                        <tr className={`border-b border-gray-200 ${isExpanded ? 'bg-purple-50/50' : ''}`}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedRow(isExpanded ? null : row.label)}
                              className="inline-flex items-start gap-2 rounded text-left text-purple-900 underline decoration-purple-200 underline-offset-4 hover:text-purple-700 hover:decoration-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                            >
                              {isExpanded ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
                              <span>
                                {row.label}
                                {row.detail && <span className="mt-0.5 block text-xs font-normal text-gray-500">{row.detail}</span>}
                              </span>
                            </button>
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-semibold ${row.tone}`}>{row.count ? row.books : peso(row.books)}</td>
                          <td className={`px-4 py-3 text-right text-sm font-semibold ${row.tone}`}>{row.count ? row.ledger : peso(row.ledger)}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-700">
                            {same(row.books, row.ledger) ? '-' : row.count ? Math.abs(row.books - row.ledger) : peso(Math.abs(row.books - row.ledger))}
                          </td>
                          <td className="px-4 py-3 text-center">{badge(same(row.books, row.ledger))}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-gray-200">
                            <td colSpan={5} className="p-3 sm:p-4">
                              <ReconciliationDetails row={row} day={today} date={selectedDate} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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

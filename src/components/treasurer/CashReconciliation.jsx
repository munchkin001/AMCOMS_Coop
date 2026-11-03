import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const displayDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const CashReconciliation = () => {
  const [reconciliationDate, setReconciliationDate] = useState(() => toDateString(new Date()));
  const [position, setPosition] = useState(null);
  const [history, setHistory] = useState([]);
  const [actualCash, setActualCash] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [positionResult, historyResult] = await Promise.all([
        supabase.rpc('get_treasurer_cash_position', { p_date: reconciliationDate }),
        supabase.from('cash_reconciliations')
          .select('id, reconciliation_date, opening_balance, cash_received, cash_released, expected_closing, actual_count, variance, remarks, submitted_at')
          .eq('reconciliation_date', reconciliationDate)
          .order('submitted_at', { ascending: false })
          .limit(10)
      ]);
      if (positionResult.error) throw positionResult.error;
      if (historyResult.error) throw historyResult.error;

      const records = historyResult.data || [];
      setPosition(positionResult.data);
      setHistory(records);
      setActualCash(records.length ? String(records[0].actual_count) : '');
      setRemarks(records.length ? records[0].remarks || '' : '');
    } catch (loadError) {
      console.error('Unable to load Treasurer cash reconciliation:', loadError);
      setError(loadError.message || 'Cash reconciliation could not be loaded.');
      setPosition(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [reconciliationDate]);

  useEffect(() => {
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions([
    'journal_entries',
    'journal_entry_lines',
    'cash_reconciliations'
  ].map((table) => ({ table, onUpdate: load })), [load]);

  const numericCount = Number(actualCash);
  const hasValidCount = actualCash.trim() !== '' && Number.isFinite(numericCount) && numericCount >= 0;
  const variance = hasValidCount && position
    ? Number((numericCount - Number(position.expected_closing || 0)).toFixed(2))
    : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!hasValidCount) {
      setError('Enter the actual Cash on Hand count as a valid amount of zero or more.');
      return;
    }

    setSaving(true);
    try {
      const { data: result, error: saveError } = await supabase.rpc('save_treasurer_cash_reconciliation', {
        p_date: reconciliationDate,
        p_actual_count: numericCount,
        p_remarks: remarks.trim() || null
      });
      if (saveError) throw saveError;
      if (!result?.id) throw new Error('The server did not confirm the reconciliation record.');
      setNotice('Cash count saved. The ledger snapshot and difference are recorded for review.');
      await load();
    } catch (saveError) {
      console.error('Unable to save Treasurer cash reconciliation:', saveError);
      setError(saveError.message || 'Cash reconciliation could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const positionCards = [
    ['Opening ledger cash', position?.opening_balance],
    ['Cash received', position?.cash_received],
    ['Cash released', position?.cash_released],
    ['Expected closing cash', position?.expected_closing]
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-[#d6ab4a] via-[#1e3a72] to-[#1e3a72]" />
      <div className="p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
            <Wallet size={22} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daily Cash Reconciliation</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
              Compare posted Cash on Hand activity with the physical cash received from the Bookkeeper and counted by the Treasurer.
            </p>
          </div>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Reconciliation date
          <input
            type="date"
            value={reconciliationDate}
            max={toDateString(new Date())}
            onChange={(event) => {
              if (!event.target.value) return;
              setReconciliationDate(event.target.value);
              setActualCash('');
              setRemarks('');
              setNotice('');
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash account</p>
          <p className="mt-1 font-semibold text-slate-900">Cash on Hand · {displayDate(reconciliationDate)}</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {positionCards.map(([label, amount]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
              {loading ? 'Loading…' : position ? money(amount) : 'Unavailable'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Expected cash is calculated from posted general-ledger activity for Cash on Hand. Bank deposits and other non-cash receipts are excluded.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="text-sm font-medium text-gray-700">
          Actual physical cash counted (₱) *
          <input
            type="number"
            min="0"
            step="0.01"
            value={actualCash}
            onChange={(event) => setActualCash(event.target.value)}
            disabled={loading || saving || !position}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Notes
          <input
            value={remarks}
            maxLength={1000}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={saving}
            placeholder="Optional handoff or count notes"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
        </label>
        <button type="submit" disabled={saving || loading || !position || !hasValidCount} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a72] px-4 py-2 font-semibold text-white shadow-sm hover:bg-[#172d59] disabled:cursor-not-allowed disabled:opacity-50">
          <CheckCircle2 size={16} aria-hidden="true" />
          {saving ? 'Saving…' : 'Save cash count'}
        </button>
      </form>

      {variance !== null && position && (
        <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          variance === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}>
          <div className="flex items-center gap-2">
            {variance === 0
              ? <CheckCircle2 size={18} aria-hidden="true" />
              : <AlertTriangle size={18} aria-hidden="true" />}
            <span className="font-semibold">
              {variance === 0 ? 'Cash count matches the ledger' : variance > 0 ? 'Cash overage' : 'Cash short'}
            </span>
          </div>
          <span className="font-bold tabular-nums">{variance > 0 ? '+' : variance < 0 ? '−' : ''}{money(Math.abs(variance))}</span>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Recent counts for {displayDate(reconciliationDate)}</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Difference</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(record.submitted_at).toLocaleString('en-PH')}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(record.expected_closing)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(record.actual_count)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${Number(record.variance) === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {Number(record.variance) > 0 ? '+' : Number(record.variance) < 0 ? '−' : ''}{money(Math.abs(Number(record.variance)))}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-slate-600">{record.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </section>
  );
};

export default CashReconciliation;

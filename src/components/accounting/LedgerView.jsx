import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Printer, RefreshCw, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import {
  PrintStyles, buttonClass, formatDate, inputClass, primaryButtonClass, startOfYearISO, todayISO, useAccounts
} from './accountingUtils';

const PAGE_SIZE = 10;

const fmt = (value) => Math.abs(Number(value || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value) => `₱${fmt(value)}`;
const signedMoney = (value) => `${Number(value) < 0 ? '₱-' : '₱'}${fmt(value)}`;
const shortDate = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return value ? `${d}/${m}/${y}` : '';
};
const noteFor = (line) => {
  if (line.is_opening) return 'Initial balance';
  if (line.is_reversal) return 'Reversing entry';
  if (line.is_reversed) return 'Reversed';
  return { adjusting: 'Adjusting entry', closing: 'Closing entry', general: 'Posted entry' }[line.entry_type] || '';
};

const Dash = () => <span className="text-gray-400">-</span>;

const SummaryStat = ({ label, value, tone = 'text-gray-900', accent = false }) => (
  <div className="px-4 py-2 sm:px-6">
    <p className={`text-xs ${accent ? 'font-medium text-blue-700' : 'text-gray-500'}`}>{label}</p>
    <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
  </div>
);

const AccountSection = ({ group }) => {
  const [page, setPage] = useState(1);
  const movement = group.lines.filter((line) => !line.is_opening);
  const opening = group.lines.find((line) => line.is_opening);
  const totalDebit = movement.reduce((sum, line) => sum + Number(line.debit), 0);
  const totalCredit = movement.reduce((sum, line) => sum + Number(line.credit), 0);
  const closing = group.lines[group.lines.length - 1]?.running_balance ?? 0;
  const openingBalance = opening ? Number(opening.running_balance) : 0;

  const pageCount = Math.max(1, Math.ceil(group.lines.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = group.lines.slice(start, start + PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-center gap-3 pr-6">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Wallet className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{group.name}</h3>
            <p className="text-xs capitalize text-gray-500">{group.code} · {group.type}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 divide-gray-200 sm:grid-cols-4 sm:divide-x">
          <SummaryStat label="Opening Balance" value={money(openingBalance)} />
          <SummaryStat label="Total Debits" value={money(totalDebit)} tone="text-green-600" />
          <SummaryStat label="Total Credits" value={money(totalCredit)} tone="text-red-600" />
          <SummaryStat label="Ending Balance" value={signedMoney(closing)} tone="text-blue-900" accent />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <h4 className="px-5 pt-5 text-lg font-bold text-gray-900">Transactions</h4>
        <div className="overflow-x-auto p-3 sm:p-5">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="rounded-l-lg px-4 py-3">Date</th>
                <th className="px-4 py-3">Particulars</th>
                <th className="px-4 py-3">Reference No.</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Running Balance</th>
                <th className="rounded-r-lg px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((line, index) => (
                <tr key={line.line_id || `opening-${index}`} className={line.is_opening ? 'bg-gray-50/70' : ''}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{line.is_opening ? shortDate(from) : shortDate(line.entry_date)}</td>
                  <td className="px-4 py-3 text-gray-800">{line.is_opening ? 'Opening Balance' : line.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">
                    {line.is_opening ? <Dash /> : (line.reference_number || line.entry_number)}
                    {line.is_reversed && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Reversed</span>}
                    {line.is_reversal && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">Reversal</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-green-600">
                    {Number(line.debit) ? money(line.debit) : <Dash />}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-red-600">
                    {Number(line.credit) ? money(line.credit) : <Dash />}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-900">{signedMoney(line.running_balance)}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{noteFor(line)}</td>
                                  </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          <span>
            Showing {group.lines.length ? start + 1 : 0}-{Math.min(start + PAGE_SIZE, group.lines.length)} of {group.lines.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded border border-gray-200 p-1.5 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
            <span className="rounded bg-blue-900 px-3 py-1.5 font-semibold text-white">{current}</span>
            <button type="button" aria-label="Next page" disabled={current >= pageCount} onClick={() => setPage(current + 1)} className="rounded border border-gray-200 p-1.5 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </div>
    </section>
  );
};

const LedgerView = () => {
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId && accounts.length) {
      const cash = accounts.find((account) => account.account_name === 'Cash on Hand');
      if (cash) setAccountId(cash.id);
    }
  }, [accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (from && to && from > to) {
      setError('The start date must be on or before the end date.');
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc('get_general_ledger', {
      p_account_id: accountId || null,
      p_from: from || null,
      p_to: to || null
    });
    if (rpcError) {
      setError(getDataLoadErrorMessage(rpcError, 'ledger entries'));
    } else {
      setError('');
      setRows(data || []);
    }
    setLoading(false);
  }, [accountId, from, to]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'journal_entries', onUpdate: load },
    { table: 'journal_entry_lines', onUpdate: load },
    { table: 'chart_of_accounts', onUpdate: load }
  ], [load]);

  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.account_id)) {
        map.set(row.account_id, { id: row.account_id, code: row.account_code, name: row.account_name, type: row.account_type, lines: [] });
      }
      map.get(row.account_id).lines.push(row);
    });
    return [...map.values()];
  }, [rows]);

  const selectedName = accounts.find((account) => account.id === accountId)?.account_name;

  const exportCsv = () => {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Account', 'Date', 'Particulars', 'Reference', 'Debit', 'Credit', 'Running Balance'].map(escape).join(',')];
    rows.forEach((row) => {
      lines.push([
        row.account_name,
        row.is_opening ? '' : String(row.entry_date).slice(0, 10),
        row.is_opening ? 'Opening Balance' : row.description,
        row.is_opening ? '' : row.entry_number,
        Number(row.debit) || '',
        Number(row.credit) || '',
        Number(row.running_balance)
      ].map(escape).join(','));
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `general-ledger-${from || 'start'}-to-${to || 'today'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PrintStyles />
      <div className="no-print rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="text-xs font-medium text-gray-600">Account
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">All accounts with activity</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.account_name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-gray-600">To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => { setLoading(true); load(); }} className={`${buttonClass} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}><RefreshCw className="size-4" aria-hidden="true" />Refresh</button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"><Printer className="size-4" aria-hidden="true" />Print</button>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className={buttonClass}><Download className="size-4" aria-hidden="true" />Export</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Derived from posted journal entries only. Assets and expenses increase with debits; all other accounts increase with credits.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div id="gl-print" className="space-y-8">
        <div className="hidden print:block">
          <h2 className="text-lg font-semibold">General Ledger{selectedName ? `: ${selectedName}` : ''}</h2>
          <p className="text-sm">{formatDate(from)} to {formatDate(to)}</p>
        </div>

        {loading && <p className="py-8 text-center text-sm text-gray-500">Loading ledger...</p>}
        {!loading && groups.length === 0 && !error && (
          <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
            No posted transactions for the selected account and period.
          </div>
        )}

        {groups.map((group) => <AccountSection key={group.id} group={group} />)}
      </div>
    </div>
  );
};

export default LedgerView;

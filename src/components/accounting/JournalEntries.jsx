import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import {
  amount, buttonClass, formatDate, formatDateTime, inputClass, primaryButtonClass, startOfYearISO, todayISO, useAccounts
} from './accountingUtils';

const emptyLine = () => ({ account_id: '', debit_amount: '', credit_amount: '', description: '' });

const EntryForm = ({ accounts, onPosted, onCancel }) => {
  const [entry, setEntry] = useState({ entry_type: 'general', entry_date: todayISO(), reference_number: '', description: '' });
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => lines.reduce((sum, line) => ({
    debit: sum.debit + (Number(line.debit_amount) || 0),
    credit: sum.credit + (Number(line.credit_amount) || 0)
  }), { debit: 0, credit: 0 }), [lines]);
  const difference = Math.round((totals.debit - totals.credit) * 100) / 100;

  const updateLine = (index, patch) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const validate = () => {
    if (!entry.description.trim()) return 'Enter a description.';
    if (!entry.entry_date) return 'Choose an entry date.';
    if (entry.entry_date > todayISO()) return 'Entries cannot be dated in the future.';
    const used = lines.filter((line) => line.account_id || Number(line.debit_amount) || Number(line.credit_amount));
    if (used.length < 2) return 'Enter at least two lines.';
    for (const line of used) {
      const debit = Number(line.debit_amount) || 0;
      const credit = Number(line.credit_amount) || 0;
      if (!line.account_id) return 'Choose an account for every line.';
      if (debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) return 'Each line needs either a debit or a credit amount.';
    }
    if (difference !== 0) return 'Total debits must equal total credits.';
    return '';
  };

  const submit = async (event) => {
    event.preventDefault();
    const message = validate();
    if (message) { setError(message); return; }
    if (!window.confirm('Post this entry? Posted entries cannot be edited or deleted; they can only be reversed.')) return;

    setSaving(true);
    setError('');
    const used = lines.filter((line) => line.account_id);
    const { error: rpcError } = await supabase.rpc('post_journal_entry', {
      p_entry: entry,
      p_lines: used.map((line) => ({
        account_id: line.account_id,
        debit_amount: Number(line.debit_amount) || 0,
        credit_amount: Number(line.credit_amount) || 0,
        description: line.description
      }))
    });
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
    onPosted();
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="text-base font-semibold text-gray-900">New journal entry</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-gray-700">Entry type
          <select value={entry.entry_type} onChange={(e) => setEntry({ ...entry, entry_type: e.target.value })} className={`${inputClass} mt-1`}>
            <option value="general">General journal entry</option>
            <option value="adjusting">Adjusting entry</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">Date
          <input type="date" value={entry.entry_date} max={todayISO()} onChange={(e) => setEntry({ ...entry, entry_date: e.target.value })} className={`${inputClass} mt-1`} required />
        </label>
        <label className="text-sm font-medium text-gray-700">Reference (optional)
          <input value={entry.reference_number} onChange={(e) => setEntry({ ...entry, reference_number: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">Description
          <input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} className={`${inputClass} mt-1`} placeholder="Explain why this entry is being made" required />
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
            <select aria-label={`Account for line ${index + 1}`} value={line.account_id} onChange={(e) => updateLine(index, { account_id: e.target.value })} className={inputClass}>
              <option value="">Select account</option>
              {accounts.filter((account) => account.is_active).map((account) => (
                <option key={account.id} value={account.id}>{account.account_name}</option>
              ))}
            </select>
            <input aria-label={`Debit for line ${index + 1}`} type="number" min="0" step="0.01" placeholder="Debit" value={line.debit_amount}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => updateLine(index, { debit_amount: e.target.value, credit_amount: e.target.value ? '' : line.credit_amount })} className={inputClass} />
            <input aria-label={`Credit for line ${index + 1}`} type="number" min="0" step="0.01" placeholder="Credit" value={line.credit_amount}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => updateLine(index, { credit_amount: e.target.value, debit_amount: e.target.value ? '' : line.debit_amount })} className={inputClass} />
            <input aria-label={`Memo for line ${index + 1}`} placeholder="Line memo (optional)" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} className={inputClass} />
            <button type="button" aria-label={`Remove line ${index + 1}`} disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className={buttonClass}>
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className={buttonClass}><Plus className="size-4" aria-hidden="true" />Add line</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <span>Debits: <strong>{amount(totals.debit) || '0.00'}</strong></span>
        <span>Credits: <strong>{amount(totals.credit) || '0.00'}</strong></span>
        <span className={difference === 0 && totals.debit > 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
          {difference === 0 && totals.debit > 0 ? 'Balanced' : `Out of balance by ${Math.abs(difference).toFixed(2)}`}
        </span>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass}>Cancel</button>
        <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Posting...' : 'Post entry'}</button>
      </div>
    </form>
  );
};

const EntryDetail = ({ entry, canPost, onReversed }) => {
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('journal_entry_lines')
      .select('id, debit_amount, credit_amount, description, account:chart_of_accounts(account_name)')
      .eq('journal_entry_id', entry.id)
      .then(({ data }) => setLines(data || []));
  }, [entry.id]);

  const canReverse = canPost && entry.status === 'posted' && !entry.reversed_by_entry_id && !entry.reverses_entry_id;

  const reverse = async () => {
    if (!reason.trim()) { setError('Enter the reason for the reversal.'); return; }
    if (!window.confirm(`Post a reversing entry for ${entry.entry_number}? The original stays in the ledger.`)) return;
    setReversing(true);
    const { error: rpcError } = await supabase.rpc('reverse_journal_entry', { p_entry_id: entry.id, p_reason: reason });
    setReversing(false);
    if (rpcError) { setError(rpcError.message); return; }
    setReason('');
    onReversed();
  };

  return (
    <div className="space-y-3 bg-gray-50 px-4 py-4 text-sm">
      <table className="min-w-full">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr><th className="py-1">Account</th><th className="py-1">Memo</th><th className="py-1 text-right">Debit</th><th className="py-1 text-right">Credit</th></tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-gray-200">
              <td className="py-1.5">{line.account?.account_name}</td>
              <td className="py-1.5 text-gray-600">{line.description}</td>
              <td className="py-1.5 text-right">{amount(line.debit_amount)}</td>
              <td className="py-1.5 text-right">{amount(line.credit_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-3">
        <div><dt className="inline font-semibold">Created by: </dt><dd className="inline">{entry.created_by_name || 'System'} ({formatDateTime(entry.created_at)})</dd></div>
        <div><dt className="inline font-semibold">Posted by: </dt><dd className="inline">{entry.posted_by_name || 'Not posted'} {entry.posted_at ? `(${formatDateTime(entry.posted_at)})` : ''}</dd></div>
        {entry.reversed_at && (
          <div><dt className="inline font-semibold">Reversed by: </dt><dd className="inline">{entry.reversed_by_name} ({formatDateTime(entry.reversed_at)}) - {entry.reversal_reason}</dd></div>
        )}
      </dl>
      {canReverse && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reversal" aria-label="Reason for reversal" className={`${inputClass} max-w-md`} />
          <button type="button" onClick={reverse} disabled={reversing} className={buttonClass}><Undo2 className="size-4" aria-hidden="true" />{reversing ? 'Reversing...' : 'Reverse entry'}</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
};

const statusBadge = (entry) => {
  if (entry.reversed_by_entry_id) return ['Reversed', 'bg-amber-100 text-amber-800'];
  if (entry.reverses_entry_id) return ['Reversal', 'bg-slate-200 text-slate-700'];
  if (entry.status === 'posted') return ['Posted', 'bg-green-100 text-green-800'];
  return [entry.status, 'bg-gray-100 text-gray-700'];
};

const JournalEntries = ({ canPost }) => {
  const accounts = useAccounts();
  const [entries, setEntries] = useState([]);
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    let query = supabase.from('journal_entry_register').select('*')
      .eq('status', 'posted')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (from) query = query.gte('entry_date', from);
    if (to) query = query.lte('entry_date', to);
    if (type) query = query.eq('entry_type', type);
    const { data, error: queryError } = await query;
    setError(queryError ? queryError.message : '');
    setEntries(data || []);
    setLoading(false);
  }, [from, to, type]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'journal_entries', onUpdate: load },
    { table: 'journal_entry_lines', onUpdate: load }
  ], [load]);

  return (
    <div className="space-y-4">
      {canPost && !showForm && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowForm(true)} className={primaryButtonClass}><Plus className="size-4" aria-hidden="true" />New journal entry</button>
        </div>
      )}
      {showForm && <EntryForm accounts={accounts} onPosted={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="text-sm font-medium text-gray-700">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-gray-700">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium text-gray-700">Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">All types</option>
            <option value="general">General</option>
            <option value="adjusting">Adjusting</option>
            <option value="reversing">Reversing</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-gray-500">Loading journal entries...</p>}
      {!loading && entries.length === 0 && !error && (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">No posted journal entries for this period.</div>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Entry no.</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Posted by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const [label, badge] = statusBadge(entry);
                const open = expanded === entry.id;
                return (
                  <React.Fragment key={entry.id}>
                    <tr className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setExpanded(open ? null : entry.id)}>
                      <td className="px-3 py-2 text-gray-400">{open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(entry.entry_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{entry.entry_number}</td>
                      <td className="px-3 py-2 text-gray-700">{entry.description}</td>
                      <td className="px-3 py-2 capitalize">{entry.entry_type}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{entry.source_type}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{amount(entry.total_debit)}</td>
                      <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>{label}</span></td>
                      <td className="px-3 py-2 text-gray-600">{entry.posted_by_name || ''}</td>
                    </tr>
                    {open && (
                      <tr><td colSpan={9} className="p-0"><EntryDetail entry={entry} canPost={canPost} onReversed={load} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JournalEntries;

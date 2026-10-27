import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { queueOperation } from '../../lib/Offline/syncQueue';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import {
  amount, buttonClass, formatDate, formatDateTime, inputClass, primaryButtonClass, startOfYearISO, todayISO, useAccounts
} from './accountingUtils';

const emptyLine = () => ({ account_id: '', debit_amount: '', credit_amount: '', description: '' });

const EntryForm = ({ accounts, onPosted, onCancel }) => {
  const { user, staff, offlineMode } = useAuth();
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
    const offline = !navigator.onLine || offlineMode;
    const confirmation = offline
      ? 'Save this journal entry on this device for server posting after reconnect? It will not be posted to the ledger until the server confirms it.'
      : 'Post this entry? Posted entries cannot be edited or deleted; they can only be reversed.';
    if (!window.confirm(confirmation)) return;

    setSaving(true);
    setError('');
    const used = lines.filter((line) => line.account_id);
    const payload = {
      p_entry: entry,
      p_lines: used.map((line) => ({
        account_id: line.account_id,
        debit_amount: Number(line.debit_amount) || 0,
        credit_amount: Number(line.credit_amount) || 0,
        description: line.description
      }))
    };
    try {
      if (offline) {
        await queueOperation({
          type: 'journal_entry',
          payload,
          userId: user?.id,
          actorRole: staff?.role,
          actorName: staff?.full_name,
          allowLocalQueue: true,
          summary: 'Journal entry queued for server posting',
          details: {
            reference: entry.reference_number || null,
            amount: totals.debit,
            localRecordedAt: new Date().toISOString(),
          },
        });
        onPosted(true);
      } else {
        const { error: rpcError } = await supabase.rpc('post_journal_entry', payload);
        if (rpcError) throw rpcError;
        onPosted(false);
      }
    } catch (saveError) {
      setError(saveError.message || 'The journal entry could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
      <div className="flex items-center gap-4 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 px-5 py-5 text-white sm:px-7">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-amber-300 shadow-inner">
          <BookOpen className="size-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Accounting · General Ledger</p>
          <h3 className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">New journal entry</h3>
          <p className="mt-0.5 text-sm text-blue-100">Record balanced debits and credits in the ledger.</p>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6 lg:p-7">
        <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-800">1</span>
            <h4 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">Entry information</h4>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Entry type
              <select value={entry.entry_type} onChange={(e) => setEntry({ ...entry, entry_type: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white font-medium`}>
                <option value="general">General journal entry</option>
                <option value="adjusting">Adjusting entry</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Date
              <input type="date" value={entry.entry_date} max={todayISO()} onChange={(e) => setEntry({ ...entry, entry_date: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white font-medium`} required />
            </label>
            <label className="text-sm font-semibold text-slate-700">Reference <span className="font-normal text-slate-500">(optional)</span>
              <input value={entry.reference_number} onChange={(e) => setEntry({ ...entry, reference_number: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white`} placeholder="e.g. receipt or voucher no." />
            </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Description
              <input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white`} placeholder="Explain why this entry is being made" required />
            </label>
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-800">2</span>
              <div>
                <h4 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">Journal lines</h4>
                <p className="text-xs text-slate-500">Each line must be entered as either a debit or a credit.</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{lines.length} lines</span>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-200 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-blue-800">{index + 1}</span>
                    Entry line
                  </span>
                  <button type="button" aria-label={`Remove line ${index + 1}`} title="Remove line" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600 sm:col-span-2 lg:col-span-4">Account
                    <select aria-label={`Account for line ${index + 1}`} value={line.account_id} onChange={(e) => updateLine(index, { account_id: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white text-sm font-medium normal-case tracking-normal`}>
                      <option value="">Select account</option>
                      {accounts.filter((account) => account.is_active).map((account) => (
                        <option key={account.id} value={account.id}>{account.account_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-blue-800 sm:col-span-1 lg:col-span-2">Debit
                    <input aria-label={`Debit for line ${index + 1}`} type="number" min="0" step="0.01" placeholder="0.00" value={line.debit_amount}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => updateLine(index, { debit_amount: e.target.value, credit_amount: e.target.value ? '' : line.credit_amount })} className={`${inputClass} mt-1.5 border-blue-200 bg-blue-50/50 text-right font-semibold text-blue-950 placeholder:text-blue-300 focus:border-blue-600 focus:ring-blue-600/20`} />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-emerald-800 sm:col-span-1 lg:col-span-2">Credit
                    <input aria-label={`Credit for line ${index + 1}`} type="number" min="0" step="0.01" placeholder="0.00" value={line.credit_amount}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => updateLine(index, { credit_amount: e.target.value, debit_amount: e.target.value ? '' : line.debit_amount })} className={`${inputClass} mt-1.5 border-emerald-200 bg-emerald-50/50 text-right font-semibold text-emerald-950 placeholder:text-emerald-300 focus:border-emerald-600 focus:ring-emerald-600/20`} />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600 sm:col-span-2 lg:col-span-4">Line memo <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
                    <input aria-label={`Memo for line ${index + 1}`} placeholder="Add a note for this line" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} className={`${inputClass} mt-1.5 border-slate-300 bg-white text-sm font-normal normal-case tracking-normal`} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-4 py-2.5 text-sm font-bold text-blue-800 transition-colors hover:border-blue-500 hover:bg-blue-100">
            <Plus className="size-4" aria-hidden="true" />Add journal line
          </button>
        </section>

        <section aria-live="polite" className={`rounded-xl border p-4 shadow-sm ${
          difference === 0 && totals.debit > 0
            ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white'
            : 'border-amber-200 bg-gradient-to-r from-amber-50 to-white'
        }`}>
          <div className="mb-3 flex items-center gap-2">
            {difference === 0 && totals.debit > 0
              ? <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
              : <AlertCircle className="size-5 text-amber-700" aria-hidden="true" />}
            <h4 className={`text-sm font-extrabold uppercase tracking-wide ${
              difference === 0 && totals.debit > 0 ? 'text-emerald-900' : 'text-amber-900'
            }`}>Balance check</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-blue-100 bg-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Total debits</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-blue-950">{amount(totals.debit) || '0.00'}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total credits</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-emerald-950">{amount(totals.credit) || '0.00'}</p>
            </div>
            <div className={`rounded-lg border px-4 py-3 ${
              difference === 0 && totals.debit > 0 ? 'border-emerald-200 bg-emerald-100/70' : 'border-amber-200 bg-amber-100/70'
            }`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${
                difference === 0 && totals.debit > 0 ? 'text-emerald-800' : 'text-amber-800'
              }`}>Status</p>
              <p className={`mt-1 text-sm font-extrabold ${
                difference === 0 && totals.debit > 0 ? 'text-emerald-950' : 'text-amber-950'
              }`}>
                {difference === 0 && totals.debit > 0 ? 'Balanced' : `Out of balance by ${Math.abs(difference).toFixed(2)}`}
              </p>
            </div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
        <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-5 sm:flex-row">
          <button type="button" onClick={onCancel} className={`${buttonClass} min-h-11 border-slate-300 px-5`}>Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-950 to-blue-800 px-6 py-2 text-sm font-extrabold text-white shadow-md shadow-blue-950/15 transition hover:from-blue-900 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Posting...' : 'Post journal entry'}
          </button>
        </div>
      </div>
    </form>
  );
};

const EntryDetail = ({ entry, canPost, onReversed }) => {
  const { user, staff, offlineMode } = useAuth();
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    try {
      const payload = { p_entry_id: entry.id, p_reason: reason };
      if (!navigator.onLine || offlineMode) {
        await queueOperation({
          type: 'journal_reversal',
          payload,
          userId: user?.id,
          actorRole: staff?.role,
          actorName: staff?.full_name,
          allowLocalQueue: true,
          entityId: entry.id,
          summary: `Reversal of journal entry ${entry.entry_number} queued`,
          details: { localRecordedAt: new Date().toISOString() },
        });
        setNotice('Reversal is pending on this device. The posted entry remains unchanged until the server validates and confirms the reversal.');
      } else {
        const { error: rpcError } = await supabase.rpc('reverse_journal_entry', payload);
        if (rpcError) throw rpcError;
        setReason('');
        onReversed();
      }
    } catch (reverseError) {
      setError(reverseError.message || 'The journal entry could not be reversed.');
    } finally {
      setReversing(false);
    }
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
      {notice && <p role="status" className="text-sm text-amber-900">{notice}</p>}
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
  const { user, staff, offlineMode } = useAuth();
  const accounts = useAccounts(user?.id, offlineMode);
  const [entries, setEntries] = useState([]);
  const [draftEntries, setDraftEntries] = useState([]);
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [deletingDraftId, setDeletingDraftId] = useState('');
  const [notice, setNotice] = useState('');
  const isManager = staff?.role === 'manager';

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
    setError(queryError ? getDataLoadErrorMessage(queryError, 'journal entries') : '');
    setEntries(data || []);
    setLoading(false);
  }, [from, to, type]);

  const loadDrafts = useCallback(async () => {
    if (!isManager) return;
    const { data, error: queryError } = await supabase.from('journal_entries')
      .select('id, entry_number, entry_date, description, reference_number, entry_type, created_at')
      .eq('status', 'draft')
      .order('created_at', { ascending: false });
    setDraftError(queryError ? getDataLoadErrorMessage(queryError, 'draft journal entries') : '');
    setDraftEntries(data || []);
  }, [isManager]);

  const deleteDraft = async (entry) => {
    const reason = window.prompt(`Why are you deleting draft ${entry.entry_number}?`);
    if (reason === null) return;
    if (!reason.trim()) {
      setDraftError('Enter a reason to delete this draft.');
      return;
    }
    if (!window.confirm(`Permanently delete draft ${entry.entry_number} and its journal lines? This action will be recorded in the audit log.`)) return;

    setDeletingDraftId(entry.id);
    setDraftError('');
    try {
      const { error: deleteError } = await supabase.rpc('manager_delete_draft_journal_entry', {
        p_entry_id: entry.id,
        p_reason: reason.trim()
      });
      if (deleteError) throw deleteError;
      setNotice(`Draft ${entry.entry_number} was deleted. Its journal lines were removed; posted ledger balances were not affected.`);
      await Promise.all([loadDrafts(), load()]);
    } catch (deleteError) {
      setDraftError(getDataLoadErrorMessage(deleteError, 'draft journal entry'));
    } finally {
      setDeletingDraftId('');
    }
  };

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  useMultipleRealtimeSubscriptions([
    { table: 'journal_entries', onUpdate: () => { load(); loadDrafts(); } },
    { table: 'journal_entry_lines', onUpdate: () => { load(); loadDrafts(); } }
  ], [load, loadDrafts]);

  return (
    <div className="space-y-4">
      {isManager && (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-slate-900">Draft journal entries</h3>
            <p className="mt-1 text-sm text-slate-600">Managers can permanently delete drafts. Posted entries are not deletable here and do not appear in this list.</p>
          </div>
          {draftError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{draftError}</p>}
          {draftEntries.length === 0 && !draftError ? (
            <p className="text-sm text-slate-500">No draft journal entries.</p>
          ) : draftEntries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Entry no.</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draftEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(entry.entry_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">{entry.entry_number}</td>
                      <td className="px-3 py-2">{entry.description}</td>
                      <td className="px-3 py-2">{entry.reference_number || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => deleteDraft(entry)}
                          disabled={Boolean(deletingDraftId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          {deletingDraftId === entry.id ? 'Deleting...' : 'Delete draft'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {canPost && !showForm && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowForm(true)} className={primaryButtonClass}><Plus className="size-4" aria-hidden="true" />New journal entry</button>
        </div>
      )}
      {showForm && <EntryForm accounts={accounts} onPosted={(queued) => {
        setShowForm(false);
        setNotice(queued
          ? 'Journal entry saved locally as pending. It is not posted in the ledger until the server confirms it.'
          : '');
        if (!queued) load();
      }} onCancel={() => setShowForm(false)} />}
      {notice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>}

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
                <th className="px-3 py-2">Source reference</th>
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
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {[entry.source_reference, entry.reference_number && entry.reference_number !== entry.source_reference ? entry.reference_number : null]
                          .filter(Boolean).join(' · ') || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{amount(entry.total_debit)}</td>
                      <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>{label}</span></td>
                      <td className="px-3 py-2 text-gray-600">{entry.posted_by_name || ''}</td>
                    </tr>
                    {open && (
                      <tr><td colSpan={10} className="p-0"><EntryDetail entry={entry} canPost={canPost} onReversed={load} /></td></tr>
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

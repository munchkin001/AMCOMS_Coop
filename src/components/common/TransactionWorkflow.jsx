import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const FILE_LIMIT = 10 * 1024 * 1024;
const ALLOWED_FILES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const STATUS_LABELS = {
  pending_approval: 'Pending Approval',
  returned_for_correction: 'Returned for Correction',
  approved: 'Approved',
  processing: 'Processing',
  awaiting_release: 'Awaiting Release',
  on_hold: 'On Hold',
  release_issue: 'Release Issue',
  released: 'Released',
  completed: 'Completed',
  rejected: 'Rejected',
  accounting_error: 'Accounting Error',
};

const STATUS_STYLES = {
  pending_approval: 'bg-amber-100 text-amber-900',
  returned_for_correction: 'bg-orange-100 text-orange-900',
  approved: 'bg-blue-100 text-blue-900',
  processing: 'bg-indigo-100 text-indigo-900',
  awaiting_release: 'bg-amber-100 text-amber-900',
  on_hold: 'bg-slate-200 text-slate-800',
  release_issue: 'bg-red-100 text-red-900',
  released: 'bg-emerald-100 text-emerald-900',
  completed: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-red-100 text-red-900',
  accounting_error: 'bg-red-100 text-red-900',
};

const TYPE_LABELS = {
  loan_application: 'Loan Application',
  loan_disbursement: 'Loan Disbursement',
  loan_payment: 'Loan Payment',
  savings_deposit: 'Savings Deposit',
  savings_withdrawal: 'Savings Withdrawal',
  time_deposit: 'Time Deposit',
  time_deposit_renewal: 'Time Deposit Renewal',
  time_deposit_withdrawal: 'Time Deposit Withdrawal',
  sale: 'Sale',
  sales_return: 'Sales Return',
  purchase: 'Purchase',
  purchase_payment: 'Purchase Payment',
  operating_expense: 'Operating Expense',
  capital_contribution: 'Capital Contribution',
  approved_dividend: 'Approved Dividend',
  other_receipt: 'Other Receipt',
  other_disbursement: 'Other Disbursement',
  bank_transfer: 'Internal Cash / Bank Transfer',
};

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const dateTime = (value) => value
  ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const relation = (value) => Array.isArray(value) ? value[0] : value;

const TransactionWorkflow = ({ role }) => {
  const isManager = role === 'manager';
  const isBookkeeper = role === 'bookkeeper';
  const isTreasurer = role === 'treasurer';
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reviewedRelease, setReviewedRelease] = useState(false);
  const [releaseFile, setReleaseFile] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('transaction_workflows')
      .select(`
        id, transaction_type, direction, source_module, source_record_id, member_id,
        counterparty_name, amount, payment_method, description, payload, approved_payload,
        status, cash_release_required, cash_release_status, accounting_status,
        manager_id, manager_decision_at, manager_remarks, bookkeeper_id, processed_at,
        journal_entry_id, business_record_table, business_record_id, treasurer_id,
        released_at, release_remarks, created_by, created_by_auth_id, created_at,
        requester:staff!transaction_workflows_created_by_fkey(full_name),
        approver:staff!transaction_workflows_manager_id_fkey(full_name),
        events:transaction_workflow_events(id, event_type, previous_status, next_status, actor_staff_id, remarks, created_at),
        documents:transaction_workflow_documents(id, document_type, object_name, file_name, mime_type, uploaded_at)
      `)
      .order('created_at', { ascending: false })
      .limit(500);

    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lt('created_at', `${dateTo}T23:59:59.999`);

    const { data, error: loadError } = await query;
    if (loadError) {
      console.error('Unable to load transaction workflow:', loadError);
      setError(`Unable to load transactions: ${loadError.message}`);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions(
    ['transaction_workflows', 'transaction_workflow_events', 'transaction_workflow_documents']
      .map((table) => ({ table, onUpdate: load })),
    [load],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (typeFilter !== 'all' && row.transaction_type !== typeFilter) return false;
      if (!term) return true;
      const requester = relation(row.requester)?.full_name || '';
      return [
        row.counterparty_name,
        row.description,
        row.transaction_type,
        row.source_module,
        requester,
        row.id,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(term));
    });
  }, [rows, search, statusFilter, typeFilter]);

  const todayRows = rows.filter((row) => row.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const pendingCount = rows.filter((row) => ['pending_approval', 'returned_for_correction'].includes(row.status)).length;
  const approvedToday = todayRows.filter((row) => row.status === 'approved' || row.status === 'completed').length;
  const rejectedToday = todayRows.filter((row) => row.status === 'rejected').length;
  const pendingAmount = rows
    .filter((row) => ['pending_approval', 'returned_for_correction'].includes(row.status))
    .reduce((total, row) => total + Number(row.amount || 0), 0);

  const runRpc = async (functionName, params, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc(functionName, params);
      if (rpcError) throw rpcError;
      if (data?.status === 'accounting_error' || data?.error) {
        throw new Error(data.error || 'Accounting could not complete this transaction.');
      }
      setNotice(successMessage);
      setRemarks('');
      setReleaseFile(null);
      setReviewedRelease(false);
      setSelected(null);
      await load();
    } catch (actionError) {
      console.error(`Unable to run ${functionName}:`, actionError);
      setError(actionError.message || 'The transaction action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async (decisionValue) => {
    if (!selected) return;
    if (decisionValue !== 'approved' && !remarks.trim()) {
      setError('Enter a reason for rejecting or returning this transaction.');
      return;
    }
    await runRpc(
      'review_transaction_workflow',
      {
        p_workflow_id: selected.id,
        p_decision: decisionValue,
        p_remarks: remarks.trim() || null,
      },
      decisionValue === 'approved'
        ? 'Transaction approved and sent to the Bookkeeper queue.'
        : decisionValue === 'rejected'
          ? 'Transaction rejected. The decision was recorded.'
          : 'Transaction returned for correction.',
    );
  };

  const processTransaction = async (workflow) => {
    await runRpc(
      'process_transaction_workflow',
      { p_workflow_id: workflow.id },
      workflow.cash_release_required
        ? 'Processing checked. The transaction is awaiting Treasurer confirmation.'
        : 'Transaction processing completed.',
    );
  };

  const uploadReleaseProof = async (workflow, file) => {
    if (!file) throw new Error('Attach proof of release before confirming.');
    if (!ALLOWED_FILES.has(file.type)) throw new Error('Proof must be a PDF, JPG, or PNG file.');
    if (file.size <= 0 || file.size > FILE_LIMIT) throw new Error('Proof must be no larger than 10 MB.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `${workflow.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('transaction-evidence')
      .upload(objectName, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error: registerError } = await supabase.rpc('register_transaction_workflow_document', {
      p_workflow_id: workflow.id,
      p_document_type: 'cash_release_acknowledgment',
      p_object_name: objectName,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_file_size: file.size,
    });
    if (registerError) throw registerError;
    return data;
  };

  const confirmRelease = async () => {
    if (!selected || !reviewedRelease) {
      setError('Review the recipient and approved amount before confirming release.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const documentId = await uploadReleaseProof(selected, releaseFile);
      const { data: result, error: confirmError } = await supabase.rpc('confirm_transaction_workflow_release', {
        p_workflow_id: selected.id,
        p_document_id: documentId,
        p_remarks: remarks.trim() || null,
      });
      if (confirmError) throw confirmError;
      if (result?.status !== 'completed') {
        throw new Error(result?.error || 'The server did not confirm the release.');
      }
      setNotice('Release confirmed. The server recorded the release and updated the workflow.');
      setSelected(null);
      setReleaseFile(null);
      setRemarks('');
      setReviewedRelease(false);
      await load();
    } catch (actionError) {
      console.error('Unable to confirm cash release:', actionError);
      setError(`Release was not confirmed: ${actionError.message || 'Please retry.'}`);
    } finally {
      setBusy(false);
    }
  };

  const createDocumentLink = async (document) => {
    const { data, error: linkError } = await supabase.storage
      .from('transaction-evidence')
      .createSignedUrl(document.object_name, 60);
    if (linkError) {
      setError(`Unable to open document: ${linkError.message}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const visibleStatuses = isManager
    ? ['all', 'pending_approval', 'returned_for_correction', 'approved', 'rejected', 'completed']
    : isBookkeeper
      ? ['all', 'approved', 'processing', 'awaiting_release', 'accounting_error', 'completed']
      : ['all', 'awaiting_release', 'on_hold', 'release_issue', 'released', 'completed'];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-slate-950 px-6 py-6 text-white shadow-sm sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">AMCOMS · Transaction Control</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {isManager ? 'Transaction Approvals' : isBookkeeper ? 'Accounting Processing' : 'Cash Release & Verification'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              {isManager
                ? 'Review submitted transactions and record an auditable decision before accounting begins.'
                : isBookkeeper
                  ? 'Process manager-approved transactions and track those awaiting settlement.'
                  : 'Verify the approved payee and amount, attach proof, and confirm the actual release.'}
            </p>
          </div>
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold hover:bg-slate-800">
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
          {['Submitted', 'Manager Approved', 'Bookkeeper Processed', ...(isTreasurer ? ['Treasurer Released'] : []), 'Completed'].map((step) => (
            <span key={step} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200">{step}</span>
          ))}
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      {isManager && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Approval summary">
          {[
            ['Pending approval', pendingCount, 'text-amber-800'],
            ['Approved today', approvedToday, 'text-emerald-800'],
            ['Rejected today', rejectedToday, 'text-red-800'],
            ['Pending amount', money(pendingAmount), 'text-slate-900'],
          ].map(([label, value, tone]) => (
            <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{label}</p>
              <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative block xl:col-span-2">
            <span className="sr-only">Search transactions</span>
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, payee…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="text-sm text-slate-600">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              {visibleStatuses.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              <option value="all">All types</option>
              {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-600">From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900" /></label>
            <label className="text-sm text-slate-600">To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900" /></label>
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading transaction workflow…</p>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <Clock3 size={24} className="mx-auto text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-800">No transactions found</p>
            <p className="mt-1 text-sm text-slate-500">Try changing the filters or check back when a transaction enters this queue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Transaction', 'Requester / Payee', 'Amount', 'Submitted', 'Status', 'Next step'].map((heading) => (
                    <th key={heading} scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const requester = relation(row.requester)?.full_name || 'Staff';
                  const actionable = (isManager && ['pending_approval', 'returned_for_correction'].includes(row.status))
                    || (isBookkeeper && row.status === 'approved')
                    || (isTreasurer && ['awaiting_release', 'on_hold', 'release_issue'].includes(row.status));
                  return (
                    <tr key={row.id} className="cursor-pointer hover:bg-blue-50/60" onClick={() => { setSelected(row); setError(''); setRemarks(''); }}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{TYPE_LABELS[row.transaction_type] || row.transaction_type}</p>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{row.description}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{row.source_module} · {row.id.slice(0, 8).toUpperCase()}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{row.counterparty_name || requester}</p>
                        {row.member_id && <p className="mt-1 text-xs text-slate-500">Member-linked</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900">{money(row.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{dateTime(row.created_at)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.status] || 'bg-slate-100 text-slate-800'}`}>
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); setError(''); setRemarks(''); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${actionable ? 'bg-slate-900 text-white hover:bg-slate-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                          {actionable ? isManager ? 'Review' : isBookkeeper ? 'Process' : 'Verify release' : 'View details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="workflow-detail-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 bg-slate-950 px-5 py-5 text-white sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{TYPE_LABELS[selected.transaction_type] || selected.transaction_type}</p>
                <h2 id="workflow-detail-title" className="mt-1 text-xl font-bold sm:text-2xl">{selected.counterparty_name || selected.description}</h2>
                <p className="mt-1 text-sm text-slate-300">{selected.source_module} · submitted {dateTime(selected.created_at)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} disabled={busy} aria-label="Close transaction details" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">×</button>
            </header>
            <div className="overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Approved / requested amount', money(selected.amount)],
                  ['Direction', selected.direction.replace('_', ' ')],
                  ['Payment method', selected.payment_method || 'Not specified'],
                  ['Workflow status', STATUS_LABELS[selected.status] || selected.status],
                  ['Manager', relation(selected.approver)?.full_name || 'Not yet assigned'],
                  ['Manager decision', dateTime(selected.manager_decision_at)],
                  ['Bookkeeper processing', selected.processed_at ? dateTime(selected.processed_at) : selected.accounting_status.replace('_', ' ')],
                  ['Cash release', selected.cash_release_required ? selected.cash_release_status.replace('_', ' ') : 'Not required'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">Purpose and submitted details</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.description}</p>
                {selected.manager_remarks && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><strong>Manager remarks:</strong> {selected.manager_remarks}</p>}
                {selected.journal_entry_id && <p className="mt-3 text-sm text-slate-600">Journal entry: <span className="font-mono">{selected.journal_entry_id}</span></p>}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-blue-800">View transaction snapshot</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selected.approved_payload || selected.payload, null, 2)}</pre>
                </details>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Supporting documents</h3>
                  {!selected.documents?.length ? <p className="mt-2 text-sm text-slate-500">No documents attached.</p> : (
                    <ul className="mt-2 space-y-2">
                      {selected.documents.map((document) => (
                        <li key={document.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700"><FileText size={16} className="shrink-0 text-slate-500" /><span className="truncate">{document.file_name}</span></span>
                          <button type="button" onClick={() => createDocumentLink(document)} className="rounded p-1 text-blue-800 hover:bg-blue-50" aria-label={`Open ${document.file_name}`}><Download size={16} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isTreasurer && selected.cash_release_required && ['awaiting_release', 'on_hold', 'release_issue'].includes(selected.status) && (
                    <label className="mt-4 block text-sm font-medium text-slate-700">
                      Proof of release (PDF, JPG, PNG; up to 10 MB) *
                      <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setReleaseFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                  )}
                </section>
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Workflow history</h3>
                  {!selected.events?.length ? <p className="mt-2 text-sm text-slate-500">No event history available.</p> : (
                    <ol className="mt-3 space-y-3">
                      {selected.events.map((event) => (
                        <li key={event.id} className="flex gap-3 text-sm">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-800"><Clock3 size={13} /></span>
                          <span><strong className="block capitalize text-slate-800">{event.event_type.replaceAll('_', ' ')}</strong><span className="text-xs text-slate-500">{dateTime(event.created_at)}</span>{event.remarks && <span className="mt-1 block text-slate-700">{event.remarks}</span>}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>

              {isManager && ['pending_approval', 'returned_for_correction'].includes(selected.status) && (
                <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-semibold text-amber-950">Manager decision</h3>
                  <p className="mt-1 text-sm text-amber-900">Approval will lock the submitted amount and transaction details. Changes after approval must be returned for correction and reviewed again.</p>
                  <label className="mt-3 block text-sm font-medium text-slate-700">Remarks {decision !== 'approved' && <span className="text-red-700">*</span>}
                    <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Reason, approval notes, or correction instructions" />
                  </label>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => submitDecision('returned_for_correction')} className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50">Return for correction</button>
                    <button type="button" disabled={busy} onClick={() => submitDecision('rejected')} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Reject</button>
                    <button type="button" disabled={busy} onClick={() => submitDecision('approved')} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Check size={16} /> Approve</button>
                  </div>
                </section>
              )}

              {isBookkeeper && selected.status === 'approved' && (
                <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div><h3 className="font-semibold text-blue-950">Ready for accounting processing</h3><p className="mt-1 text-sm text-blue-900">This action validates and posts using the existing transaction-specific business and accounting logic.</p></div>
                  <button type="button" disabled={busy} onClick={() => processTransaction(selected)} className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50">{busy ? 'Processing…' : selected.cash_release_required ? 'Prepare for release' : 'Process transaction'}</button>
                </section>
              )}

              {isTreasurer && selected.cash_release_required && ['awaiting_release', 'on_hold', 'release_issue'].includes(selected.status) && (
                <section className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-emerald-800" size={20} />
                    <div><h3 className="font-semibold text-emerald-950">Confirm physical release</h3><p className="mt-1 text-sm text-emerald-900">Confirm the recipient and approved amount below. The server uses the approved amount; this confirmation cannot change it. Proof is required.</p></div>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" checked={reviewedRelease} onChange={(event) => setReviewedRelease(event.target.checked)} className="mt-1" />
                    I verified the recipient and approved amount of <strong>{money(selected.amount)}</strong>.
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Release note (optional)
                    <input value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => { setDecision('on_hold'); if (!remarks.trim()) setError('Enter a reason before placing this release on hold.'); else runRpc('place_transaction_workflow_on_hold', { p_workflow_id: selected.id, p_reason: remarks.trim() }, 'Transaction placed on hold.'); }} className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Place on hold</button>
                    <button type="button" disabled={busy} onClick={() => { if (!remarks.trim()) { setError('Enter a discrepancy reason.'); return; } runRpc('report_transaction_workflow_release_issue', { p_workflow_id: selected.id, p_reason: remarks.trim() }, 'Release issue recorded for review.'); }} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"><AlertTriangle size={16} /> Report issue</button>
                    <button type="button" disabled={busy || !reviewedRelease || !releaseFile} onClick={confirmRelease} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? 'Confirming…' : 'Confirm release'}</button>
                  </div>
                </section>
              )}

              {isTreasurer && selected.direction === 'cash_in' && selected.status === 'completed' && (
                <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="font-semibold text-blue-950">Cash-in verification (optional)</h3>
                  <p className="mt-1 text-sm text-blue-900">This records Treasurer verification without changing the amount or posting the transaction a second time.</p>
                  <button type="button" disabled={busy} onClick={() => runRpc('verify_transaction_workflow_cash_received', { p_workflow_id: selected.id, p_remarks: remarks.trim() || null }, 'Cash receipt verification recorded.')} className="mt-3 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify cash received</button>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default TransactionWorkflow;

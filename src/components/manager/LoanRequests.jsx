import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Filter, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import LoadingSpinner from '../common/LoadingSpinner';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { queueOperation, getOperation } from '../../lib/Offline/syncQueue';
import { syncPendingOperations } from '../../lib/Offline/syncOperations';
import offlineDb from '../../lib/Offline/OfflineDb';
import { Link } from 'react-router-dom';

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fullName = (member) => [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
const memberOf = (record) => (Array.isArray(record?.member) ? record.member[0] : record?.member);
const matchesMemberSearch = (record, query, identifier) => {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  const member = memberOf(record);
  return [fullName(member), member?.member_number, identifier]
    .some((value) => String(value || '').toLocaleLowerCase().includes(search));
};
const requestData = (request) => request.request_data || {};
const loanTypes = ['Regular', 'Agricultural', 'Emergency'];
const cashOutTransactionTypes = [
  'loan_disbursement',
  'savings_withdrawal',
  'time_deposit_withdrawal',
  'purchase',
  'purchase_payment',
  'operating_expense',
  'other_disbursement',
  'bank_transfer',
];

const transactionTypeLabel = (type) => ({
  loan_disbursement: 'Loan disbursement',
  savings_withdrawal: 'Savings withdrawal',
  time_deposit_withdrawal: 'Time deposit withdrawal',
  purchase: 'Purchase',
  purchase_payment: 'Purchase payment',
  operating_expense: 'Operating expense',
  other_disbursement: 'Other disbursement',
  bank_transfer: 'Bank transfer',
})[type] || String(type || 'Cash disbursement').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const fetchAllRows = async (buildQuery) => {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: queryError } = await buildQuery().range(offset, offset + pageSize - 1);
    if (queryError) throw queryError;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
};

const TreasurerApprovedTransactions = () => {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [proofLinks, setProofLinks] = useState({});
  const [proofErrors, setProofErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [workflows, disbursements] = await Promise.all([
        fetchAllRows(() => supabase
          .from('transaction_workflows')
          .select(`
            id, transaction_type, direction, source_module, source_record_id, member_id,
            counterparty_name, amount, payment_method, description, payload, approved_payload,
            status, cash_release_required, cash_release_status, accounting_status,
            manager_id, manager_decision_at, manager_remarks, bookkeeper_id, processed_at,
            journal_entry_id, business_record_table, business_record_id, treasurer_id,
            released_at, release_remarks, created_by, created_at,
            requester:staff!transaction_workflows_created_by_fkey(full_name),
            approver:staff!transaction_workflows_manager_id_fkey(full_name),
            member:members(first_name, middle_name, last_name, member_number),
            events:transaction_workflow_events(id, event_type, previous_status, next_status, actor_staff_id, remarks, created_at),
            documents:transaction_workflow_documents(id, document_type, object_name, file_name, mime_type, uploaded_at)
          `)
          .eq('direction', 'cash_out')
          .eq('cash_release_required', true)
          .eq('status', 'completed')
          .eq('cash_release_status', 'released')
          .is('superseded_by', null)
          .order('released_at', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })),
        fetchAllRows(() => supabase
          .from('cash_disbursements')
          .select('id, voucher_number, disbursement_date, payee, amount, payment_method, description, journal_entry_id, created_by, created_at, status, member_id, loan_id, member:members(first_name, middle_name, last_name, member_number)')
          .eq('status', 'recorded')
          .order('disbursement_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })),
      ]);

      const linkedDisbursementIds = new Set(workflows
        .filter((workflow) => workflow.business_record_table === 'cash_disbursements')
        .map((workflow) => workflow.business_record_id)
        .filter(Boolean));
      const workflowRows = workflows.map((workflow) => ({
        ...workflow,
        key: `workflow-${workflow.id}`,
        date: workflow.released_at || workflow.processed_at || workflow.created_at,
        counterparty: workflow.counterparty_name || fullName(memberOf(workflow)),
        reference: workflow.business_record_id || workflow.source_record_id || workflow.id,
        source: 'workflow',
      }));
      const legacyRows = disbursements
        .filter((disbursement) => !linkedDisbursementIds.has(disbursement.id))
        .map((disbursement) => ({
          ...disbursement,
          key: `disbursement-${disbursement.id}`,
          transaction_type: disbursement.loan_id
            ? 'loan_disbursement'
            : /\bpurchase\b/i.test(`${disbursement.description || ''} ${disbursement.voucher_number || ''}`)
              ? 'purchase_payment'
              : 'other_disbursement',
          description: disbursement.description || 'Cash disbursement',
          counterparty: disbursement.payee || fullName(memberOf(disbursement)),
          date: disbursement.disbursement_date || disbursement.created_at,
          reference: disbursement.voucher_number || disbursement.id,
          status: 'completed',
          cash_release_status: 'released',
          source: 'disbursement',
        }));
      setRows([...workflowRows, ...legacyRows].sort((left, right) => new Date(right.date) - new Date(left.date)));
    } catch (loadError) {
      console.error('Unable to load approved cash transactions:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'approved cash transactions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions(
    ['transaction_workflows', 'transaction_workflow_events', 'transaction_workflow_documents', 'cash_disbursements']
      .map((table) => ({ table, onUpdate: load })),
    [load],
  );

  const transactionTypes = useMemo(
    () => [...new Set([...cashOutTransactionTypes, ...rows.map((row) => row.transaction_type)])].sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const rowDate = String(row.date || '').slice(0, 10);
      if (typeFilter !== 'all' && row.transaction_type !== typeFilter) return false;
      if (dateFrom && rowDate < dateFrom) return false;
      if (dateTo && rowDate > dateTo) return false;
      if (!term) return true;
      const member = memberOf(row);
      return [
        row.counterparty,
        member?.member_number,
        row.description,
        transactionTypeLabel(row.transaction_type),
        row.reference,
        row.id,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(term));
    });
  }, [dateFrom, dateTo, rows, search, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openProof = async (document) => {
    setProofErrors((current) => ({ ...current, [document.id]: '' }));
    try {
      const { data, error: linkError } = await supabase.storage
        .from('transaction-evidence')
        .createSignedUrl(document.object_name, 60);
      if (linkError) throw linkError;
      setProofLinks((current) => ({ ...current, [document.id]: data.signedUrl }));
    } catch (linkError) {
      console.error('Unable to open transaction proof:', linkError);
      setProofErrors((current) => ({ ...current, [document.id]: linkError.message || 'The attachment could not be opened.' }));
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Treasurer · Cash control</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Approved Transactions</h1>
          <p className="mt-1 text-sm text-gray-600">Cash-out transactions confirmed and recorded as released.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw aria-hidden="true" size={16} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Cash released</h2>
            <p className="mt-1 text-sm text-slate-500">{filteredRows.length} transaction{filteredRows.length === 1 ? '' : 's'} found</p>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search payee, type, or reference"
              aria-label="Search approved transactions"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 flex items-center gap-1.5"><Filter size={14} /> Transaction type</span>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
              <option value="all">All money-out types</option>
              {transactionTypes.map((type) => <option key={type} value={type}>{transactionTypeLabel(type)}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 flex items-center gap-1.5"><CalendarDays size={14} /> Released from</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 flex items-center gap-1.5"><CalendarDays size={14} /> Released to</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 block">Rows per page</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size} entries</option>)}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-100/80">
              <tr>
                {['Release date', 'Transaction', 'Payee / member', 'Description', 'Amount', 'Status'].map((heading) => (
                  <th key={heading} scope="col" className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length ? visibleRows.map((row) => (
                <tr
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${transactionTypeLabel(row.transaction_type)} details for ${row.counterparty}`}
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(row);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-blue-50/70 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                >
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{row.date ? new Date(row.date).toLocaleDateString('en-PH') : '—'}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-800">{transactionTypeLabel(row.transaction_type)}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-900">{row.counterparty || 'Not specified'}</td>
                  <td className="max-w-[280px] truncate px-5 py-4 text-sm text-slate-600" title={row.description}>{row.description || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(row.amount)}</td>
                  <td className="whitespace-nowrap px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Cash released</span></td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">{rows.length ? 'No released transactions match these search filters.' : 'No released transactions have been recorded yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-sm text-slate-500">
            {filteredRows.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length}` : 'Showing 0 entries'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="min-w-20 text-center text-sm text-slate-600">Page {currentPage} of {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="released-transaction-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 bg-slate-950 px-6 py-5 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">Cash release · Completed</p>
                <h2 id="released-transaction-title" className="mt-1 text-xl font-bold">{transactionTypeLabel(selected.transaction_type)}</h2>
                <p className="mt-1 text-sm text-slate-300">{selected.counterparty || 'Payee not specified'} · {formatMoney(selected.amount)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close transaction details" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X size={18} /></button>
            </header>
            <div className="max-h-[calc(92vh-84px)] space-y-5 overflow-y-auto p-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Status', 'Cash released'],
                  ['Release date', selected.date ? new Date(selected.date).toLocaleDateString('en-PH') : 'Not available'],
                  ['Payee / member', selected.counterparty || 'Not specified'],
                  ['Member number', memberOf(selected)?.member_number || 'Not applicable'],
                  ['Payment method', selected.payment_method || 'Not specified'],
                  ['Reference', selected.reference || 'Not available'],
                  ['Requested by', selected.requester?.full_name || 'Recorded before workflow tracking'],
                  ['Approved by', selected.approver?.full_name || 'Not available'],
                  ['Description', selected.description || 'Not provided'],
                  ['Journal entry', selected.journal_entry_id || 'Not linked'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {selected.source === 'workflow' && (
                <>
                  {!!selected.documents?.length && (
                    <section className="rounded-xl border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-800">Attachments</h3>
                      <ul className="mt-3 space-y-2">
                        {selected.documents.map((document) => (
                          <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-sm text-slate-700">{document.file_name}</span>
                            {proofLinks[document.id] ? (
                              <a href={proofLinks[document.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-800 hover:underline">Open <ExternalLink size={14} /></a>
                            ) : (
                              <button type="button" onClick={() => openProof(document)} className="text-sm font-semibold text-blue-800 hover:underline">Prepare link</button>
                            )}
                            {proofErrors[document.id] && <span role="alert" className="w-full text-xs text-red-700">{proofErrors[document.id]}</span>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {!!selected.events?.length && (
                    <section className="rounded-xl border border-slate-200 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Clock3 size={16} /> Workflow history</h3>
                      <ol className="mt-3 space-y-3">
                        {[...selected.events].sort((left, right) => new Date(left.created_at) - new Date(right.created_at)).map((event) => (
                          <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                            <p className="text-sm font-semibold text-slate-800">{event.event_type.replaceAll('_', ' ')}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{new Date(event.created_at).toLocaleString('en-PH')}</p>
                            {event.remarks && <p className="mt-1 text-sm text-slate-600">{event.remarks}</p>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export const LegacyLoanRequests = () => {
  const { user, staff, offlineMode } = useAuth();
  const canReview = staff?.role === 'manager';
  const canSubmitApplication = staff?.role === 'bookkeeper';
  const canViewQueue = ['manager', 'bookkeeper'].includes(staff?.role);
  const userId = user?.id;
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [memberLoadAttempt, setMemberLoadAttempt] = useState(0);
  const [terms, setTerms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [approvedLoans, setApprovedLoans] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [requestSearch, setRequestSearch] = useState('');
  const [loanSearch, setLoanSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [memberName, setMemberName] = useState('');
  const [loanType, setLoanType] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [collateralType, setCollateralType] = useState('');
  const [collateralDescription, setCollateralDescription] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorContact, setGuarantorContact] = useState('');
  const [processingFee, setProcessingFee] = useState('0');
  const [serviceFee, setServiceFee] = useState('0');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [savingApplication, setSavingApplication] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState('');
  const activeTerm = terms.find((term) => term.id === selectedTerm);
  const requestedAmount = Number(amount);
  const quotePreview = activeTerm && Number.isFinite(requestedAmount) && requestedAmount > 0
    ? (() => {
      const installments = activeTerm.payment_frequency === 'weekly'
        ? Math.round(activeTerm.term_months * 52 / 12)
        : activeTerm.term_months;
      const interest = Math.round(requestedAmount * Number(activeTerm.annual_rate) / 100 * activeTerm.term_months / 12 * 100) / 100;
      const total = requestedAmount + interest;
      return { interest, total, installment: Math.round(total / installments * 100) / 100 };
    })()
    : null;

  useEffect(() => {
    if (!canSubmitApplication) {
      setMembersLoading(false);
      return undefined;
    }

    let active = true;
    const cacheKey = userId ? `cashbook-members:${userId}` : null;

    const loadMembers = async () => {
      setMembersLoading(true);
      setMembersError('');
      setMembers([]);

      try {
        if (!navigator.onLine || offlineMode) {
          const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
          if (!Array.isArray(cached?.data)) {
            throw new Error('No member list is saved on this device. Reconnect and retry to load the member list.');
          }
          if (active) {
            setMembers(cached.data);
            if (cached.data.length === 0) setMembersError('No active members were found in the saved list.');
          }
          return;
        }

        const { data, error: memberError } = await supabase.from('members')
          .select('id, member_number, first_name, middle_name, last_name')
          .eq('membership_status', 'active')
          .is('archived_at', null)
          .order('last_name');
        if (memberError) throw memberError;

        if (active) {
          setMembers(data || []);
          if (!data?.length) setMembersError('No active members were found.');
        }
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({
              key: cacheKey,
              data: data || [],
              updatedAt: new Date().toISOString(),
            });
          } catch (cacheError) {
            console.error('Unable to cache loan request members:', cacheError);
          }
        }
      } catch (memberError) {
        console.error('Unable to load loan request members:', memberError);
        let cached = null;
        try {
          cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
        } catch (cacheError) {
          console.error('Unable to read cached loan request members:', cacheError);
        }
        if (active && Array.isArray(cached?.data) && cached.data.length > 0) {
          setMembers(cached.data);
          setMembersError('Showing the saved member list. Reconnect and refresh it before submitting.');
        } else if (active) {
          setMembers([]);
          setMembersError(memberError instanceof Error
            ? memberError.message
            : 'The member list could not be loaded. Retry or enter the member name for offline sync.');
        }
      } finally {
        if (active) setMembersLoading(false);
      }
    };

    loadMembers();
    return () => { active = false; };
  }, [canSubmitApplication, memberLoadAttempt, offlineMode, userId]);

  const load = useCallback(async () => {
    setError('');
    try {
      const requestQuery = canViewQueue
        ? supabase
          .from('requests')
          .select('id, request_number, request_type, member_id, status, request_data, amount, created_at, member:members(first_name, middle_name, last_name, member_number)')
          .eq('request_type', 'loan_application')
          .in('status', ['pending', 'under_review'])
          .order('created_at', { ascending: true })
          .limit(500)
        : Promise.resolve({ data: [], error: null });
      const termQuery = canSubmitApplication
        ? supabase.from('loan_term_options')
          .select('id, term_months, payment_frequency, annual_rate, penalty_rate')
          .eq('is_active', true)
          .order('term_months')
          .order('payment_frequency')
        : Promise.resolve({ data: [], error: null });
      const [requestResult, loanResult, termResult] = await Promise.all([
        requestQuery,
        supabase
          .from('loans')
          .select('id, loan_number, request_id, member_id, principal_amount, interest_rate, total_interest, total_amount, balance, term_months, payment_frequency, installments, installment_amount, monthly_payment, penalty_rate, penalty_total, application_date, approval_date, release_date, maturity_date, status, notes, member:members(first_name, middle_name, last_name, member_number), request:requests!loans_request_id_fkey(request_number, request_data)')
          .in('status', ['approved', 'active'])
          .order('approval_date', { ascending: true })
          .limit(500),
        termQuery
      ]);
      if (requestResult.error) throw requestResult.error;
      if (loanResult.error) throw loanResult.error;
      if (termResult.error) throw termResult.error;
      const loans = loanResult.data || [];
      let releasedLoanIds = new Set();
      if (loans.length) {
        const loanIds = loans.map((loan) => loan.id);
        const [disbursementResult, workflowResult] = await Promise.all([
          supabase.from('cash_disbursements')
            .select('loan_id')
            .in('loan_id', loanIds)
            .eq('status', 'recorded'),
          supabase.from('transaction_workflows')
            .select('source_record_id')
            .eq('transaction_type', 'loan_disbursement')
            .eq('source_module', 'loan_application')
            .in('source_record_id', loanIds)
            .eq('status', 'completed')
            .eq('cash_release_status', 'released')
        ]);
        if (disbursementResult.error) throw disbursementResult.error;
        if (workflowResult.error) throw workflowResult.error;
        const recordedLoanIds = new Set(
          (disbursementResult.data || []).map((row) => row.loan_id).filter(Boolean)
        );
        releasedLoanIds = new Set(
          (workflowResult.data || [])
            .map((row) => row.source_record_id)
            .filter((loanId) => loanId && recordedLoanIds.has(loanId))
        );
      }
      setRequests(requestResult.data || []);
      setApprovedLoans(loans.map((loan) => ({
        ...loan,
        cashReleased: releasedLoanIds.has(loan.id)
      })));
      setTerms(termResult.data || []);
    } catch (loadError) {
      console.error('Unable to load loan requests:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'loan requests'));
    } finally {
      setLoading(false);
    }
  }, [canSubmitApplication, canViewQueue]);

  useEffect(() => {
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions(
    ['requests', 'loans', 'cash_disbursements', 'transaction_workflows'].map((table) => ({ table, onUpdate: load })),
    [load]
  );

  const submitDecision = async () => {
    if (!decision || !notes.trim()) return;
    setBusyId(decision.id);
    setError('');
    try {
      const { data: workflow, error: workflowError } = await supabase
        .from('transaction_workflows')
        .select('id')
        .eq('transaction_type', 'loan_application')
        .eq('source_module', 'loan_application')
        .eq('source_record_id', decision.id)
        .maybeSingle();
      if (workflowError) throw workflowError;
      if (!workflow?.id) {
        throw new Error('This loan application has no approval workflow. Enable the centralized transaction workflow migrations before approving or rejecting loans.');
      }

      const { error: reviewError } = await supabase.rpc('review_transaction_workflow', {
        p_workflow_id: workflow.id,
        p_decision: decision.status,
        p_remarks: notes.trim()
      });
      if (reviewError) throw reviewError;
      setDecision(null);
      setNotes('');
      await load();
    } catch (reviewError) {
      console.error('Unable to review loan request:', reviewError);
      const message = reviewError.code === 'PGRST202'
        ? 'The loan-approval database function is not installed yet. Apply migration 20261013000015_repair_loan_application_approval_rpc.sql, then refresh this page. No decision was saved.'
        : reviewError.message;
      setError(`The decision could not be saved: ${message}`);
    } finally {
      setBusyId(null);
    }
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const manuallyEnteringMember = members.length === 0;
    const manuallyEnteringTerm = terms.length === 0;
    const member = members.find((candidate) => candidate.id === selectedMember);
    const resolvedMemberName = manuallyEnteringMember
      ? memberName.trim()
      : member ? fullName(member) : '';
    const term = manuallyEnteringTerm
      ? { term_months: Number(termMonths), payment_frequency: paymentFrequency }
      : terms.find((option) => option.id === selectedTerm);
    const applicationDetails = {
      collateral_type: collateralType.trim(),
      collateral_description: collateralDescription.trim(),
      guarantor_name: guarantorName.trim(),
      guarantor_contact: guarantorContact.trim(),
      processing_fee: Number(processingFee || 0),
      service_fee: Number(serviceFee || 0),
    };
    if (
      !resolvedMemberName ||
      !loanType.trim() ||
      !purpose.trim() ||
      !term ||
      !Number.isInteger(Number(term.term_months)) ||
      Number(term.term_months) <= 0 ||
      !['monthly', 'weekly'].includes(term.payment_frequency) ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0 ||
      !Number.isFinite(applicationDetails.processing_fee) ||
      applicationDetails.processing_fee < 0 ||
      !Number.isFinite(applicationDetails.service_fee) ||
      applicationDetails.service_fee < 0
    ) {
      setError('Complete all loan application fields with a valid amount.');
      return;
    }

    setSavingApplication(true);
    try {
      if (manuallyEnteringMember || !navigator.onLine || offlineMode) {
        const operationId = await queueOperation({
          type: 'bookkeeper_loan_application',
          payload: {
            p_member_name: resolvedMemberName,
            p_amount: Number(amount),
            p_loan_type: loanType.trim(),
            p_purpose: purpose.trim(),
            p_term_months: Number(term.term_months),
            p_frequency: term.payment_frequency,
            p_application_details: applicationDetails,
          },
          userId: user?.id,
          actorRole: staff?.role,
          actorName: staff?.full_name,
          allowLocalQueue: true,
          summary: `Loan application for ${resolvedMemberName}`,
          details: {
            memberName: resolvedMemberName,
            amount: Number(amount),
            termMonths: Number(term.term_months),
            paymentFrequency: term.payment_frequency,
            applicationDetails,
            localRecordedAt: new Date().toISOString(),
          },
        });
        setNotice('Loan application saved on this device. It will be matched to an active member and checked against current repayment terms when online.');
        if (navigator.onLine && !offlineMode) {
          try {
            await syncPendingOperations();
            let operation = await getOperation(operationId);
            if (operation?.status === 'pending') {
              await syncPendingOperations();
              operation = await getOperation(operationId);
            }
            if (operation?.status === 'synced') {
              setNotice('Member matched and loan application sent to the Manager for review.');
              setMemberName('');
              setSelectedMember('');
              setLoanType('');
              setAmount('');
              setPurpose('');
              setCollateralType('');
              setCollateralDescription('');
              setGuarantorName('');
              setGuarantorContact('');
              setProcessingFee('0');
              setServiceFee('0');
              setSelectedTerm('');
              setTermMonths('');
              setPaymentFrequency('');
              await load();
            } else if (operation?.status === 'failed') {
              setError(operation.lastError || 'The loan application could not be verified and submitted.');
              setNotice('');
            }
          } catch (syncError) {
            console.error('Loan application was saved but could not be synchronized:', syncError);
            setError(`Saved on this device, but synchronization could not finish: ${syncError.message || 'try again when online.'}`);
          }
        }
        return;
      }

      const { error: submitError } = await supabase.rpc('submit_loan_request_for_member_with_details', {
        p_member_id: selectedMember,
        p_amount: Number(amount),
        p_loan_type: loanType.trim(),
        p_purpose: purpose.trim(),
        p_term_months: term.term_months,
        p_frequency: term.payment_frequency,
        p_application_details: applicationDetails,
      });
      if (submitError) throw submitError;
      setSelectedMember('');
      setMemberName('');
      setLoanType('');
      setAmount('');
      setPurpose('');
      setCollateralType('');
      setCollateralDescription('');
      setGuarantorName('');
      setGuarantorContact('');
      setProcessingFee('0');
      setServiceFee('0');
      setSelectedTerm('');
      setTermMonths('');
      setPaymentFrequency('');
      setNotice('Loan application sent to the Manager for review.');
      await load();
    } catch (submitError) {
      console.error('Unable to create loan application:', submitError);
      const message = submitError.code === 'PGRST202'
        ? 'The detailed loan application function is not enabled on the server yet. Apply migration 20261030000001_loan_application_details.sql, then refresh this page.'
        : submitError.message;
      setError(message || 'The loan application could not be submitted.');
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const filteredRequests = requests.filter((request) => matchesMemberSearch(request, requestSearch, request.request_number));
  const filteredApprovedLoans = approvedLoans.filter((loan) => matchesMemberSearch(loan, loanSearch, loan.loan_number));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{staff?.role === 'treasurer' ? 'Approved Loans' : 'Loan Requests'}</h1>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw aria-hidden="true" size={16} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {canSubmitApplication && membersError && (
        <div role={members.length > 0 ? 'status' : 'alert'} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{membersError}</span>
          {navigator.onLine && !offlineMode && (
            <button type="button" onClick={() => setMemberLoadAttempt((attempt) => attempt + 1)} disabled={membersLoading} className="rounded-md border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100 disabled:opacity-50">
              {membersLoading ? 'Loading...' : 'Retry member list'}
            </button>
          )}
        </div>
      )}

      {canSubmitApplication && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Enter a loan application</h2>
          <form onSubmit={submitApplication} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Member *
              {membersLoading || members.length > 0 ? (
                <select required disabled={membersLoading || members.length === 0} value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100">
                  <option value="">{membersLoading ? 'Loading members...' : 'Select a member'}</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)}{member.member_number ? ` (${member.member_number})` : ''}</option>)}
                </select>
              ) : (
                <>
                  <input required maxLength={200} value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Enter member's full name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <span className="mt-1 block text-xs text-amber-800">The server will submit only if exactly one active member has this full name.</span>
                </>
              )}
            </label>
            <label className="text-sm font-medium text-gray-700">
              Loan type *
              <select required value={loanType} onChange={(event) => setLoanType(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="">Select a loan type</option>
                {loanTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Amount *
              <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Repayment term *
              {terms.length === 0 ? (
                <>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input required type="number" min="1" step="1" value={termMonths} onChange={(event) => setTermMonths(event.target.value)} placeholder="Months" aria-label="Repayment term in months" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                    <select required value={paymentFrequency} onChange={(event) => setPaymentFrequency(event.target.value)} aria-label="Payment frequency" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                      <option value="" disabled>Select frequency</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <span className="mt-1 block text-xs text-amber-800">The server will accept this only if it matches an active configured repayment term.</span>
                </>
              ) : (
                <select required value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <option value="">Select a term</option>
                  {terms.map((term) => <option key={term.id} value={term.id}>{term.term_months} months · {term.payment_frequency} · {term.annual_rate}% annual interest</option>)}
                </select>
              )}
            </label>
            {activeTerm && (
              <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
                Configured rate: <strong>{activeTerm.annual_rate}% annual interest</strong> · {activeTerm.penalty_rate}% penalty rate for overdue payments.
                {quotePreview && <> Estimated interest: <strong>{formatMoney(quotePreview.interest)}</strong> · total repayment: <strong>{formatMoney(quotePreview.total)}</strong> · installment: <strong>{formatMoney(quotePreview.installment)}</strong>.</>}
                <span className="mt-1 block text-xs">Estimate only; the server recalculates the final quote using the active cooperative terms.</span>
              </p>
            )}
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">
              Purpose *
              <textarea required maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <fieldset className="grid gap-3 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-gray-800">Security and guarantor (if applicable)</legend>
              <label className="text-sm font-medium text-gray-700">
                Collateral type
                <input maxLength={80} value={collateralType} onChange={(event) => setCollateralType(event.target.value)} placeholder="e.g. savings, equipment, property" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Collateral details
                <input maxLength={300} value={collateralDescription} onChange={(event) => setCollateralDescription(event.target.value)} placeholder="Description or identifying details" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Co-maker / guarantor name
                <input maxLength={160} value={guarantorName} onChange={(event) => setGuarantorName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Co-maker / guarantor contact
                <input maxLength={80} value={guarantorContact} onChange={(event) => setGuarantorContact(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <p className="text-xs text-gray-500 sm:col-span-2">These details are subject to cooperative policy and Manager verification.</p>
            </fieldset>
            <fieldset className="grid gap-3 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-gray-800">Fees (if applicable)</legend>
              <label className="text-sm font-medium text-gray-700">
                Processing fee (₱)
                <input type="number" min="0" step="0.01" value={processingFee} onChange={(event) => setProcessingFee(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Other / service fee (₱)
                <input type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <p className="text-xs text-gray-500 sm:col-span-2">Enter only fees confirmed by cooperative policy. Fees are recorded separately and are not included in the interest quote.</p>
            </fieldset>
            <button type="submit" disabled={savingApplication} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:col-span-2">
              {savingApplication ? 'Submitting...' : !navigator.onLine || offlineMode ? 'Save loan application offline' : 'Send for Manager approval'}
            </button>
          </form>
        </section>
      )}

      {canViewQueue && <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="text-amber-700" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Applications awaiting decision ({requests.length})</h2>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search member or request" aria-label="Search loan applications by member or request number" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
        </div>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No loan applications are waiting for review.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Member</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Request</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Loan type</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Amount</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Submitted</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">No loan applications match “{requestSearch}”.</td></tr>
                ) : filteredRequests.map((request) => {
                  const data = requestData(request);
                  return (
                    <tr
                      key={request.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`View loan application ${request.request_number} for ${fullName(memberOf(request))}`}
                      onClick={() => setSelectedRequest(request)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedRequest(request);
                        }
                      }}
                      className="cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-900">{fullName(memberOf(request))}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{request.request_number}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{data.loan_type || 'Not specified'}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(request.amount)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{new Date(request.created_at).toLocaleDateString('en-PH')}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-900">{request.status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {selectedRequest && (() => {
        const data = requestData(selectedRequest);
        const applicationDetails = data.application_details || {};
        return (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRequest(null);
            }}
          >
            <section role="dialog" aria-modal="true" aria-labelledby="loan-request-details-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl">
              <header className="relative overflow-hidden bg-gradient-to-br from-[#163c34] via-[#1d5145] to-[#276456] px-5 py-5 text-white sm:px-7">
                <div className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-100">Loan application</p>
                    <h2 id="loan-request-details-title" className="mt-1 text-2xl font-bold tracking-tight">Application details</h2>
                    <p className="mt-1 break-all text-sm text-emerald-100">{selectedRequest.request_number} · Submitted {new Date(selectedRequest.created_at).toLocaleDateString('en-PH')}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedRequest(null)} aria-label="Close loan application details" className="flex size-9 flex-none items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <X aria-hidden="true" size={20} />
                  </button>
                </div>
                <div className="relative mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/15 pt-4">
                  <div>
                    <p className="text-xs font-medium text-emerald-100">Requested amount</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(selectedRequest.amount)}</p>
                    <p className="mt-1 text-sm text-emerald-100">{fullName(memberOf(selectedRequest))}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-amber-200/20 bg-amber-200/15 px-3 py-1.5 text-xs font-semibold capitalize text-amber-50">
                    {selectedRequest.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <header className="border-b border-slate-100 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Request information</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Loan terms and information provided by the member</p>
                  </header>
                  <dl className="grid gap-px bg-slate-100 sm:grid-cols-2">
                    {[
                      ['Member', fullName(memberOf(selectedRequest))],
                      ['Loan type', data.loan_type || 'Not specified'],
                      ['Loan term and payment schedule', `${data.term_months || '—'} months · ${data.payment_frequency || 'monthly'} payments`],
                      ['Purpose', data.purpose || 'Not provided'],
                      ['Total interest', formatMoney(data.total_interest)],
                      ['Total amount to repay', formatMoney(data.total_payable)],
                      ['Payment amount per installment', formatMoney(data.installment_amount)],
                      ['Annual interest rate', `${data.annual_rate ?? '—'}%`],
                      ['Late payment penalty rate', `${data.penalty_rate ?? '—'}%`],
                      ['Processing fee / service fee', `${formatMoney(applicationDetails.processing_fee)} / ${formatMoney(applicationDetails.service_fee)}`],
                      ['Collateral', [applicationDetails.collateral_type, applicationDetails.collateral_description].filter(Boolean).join(' — ') || 'Not provided'],
                      ['Guarantor', [applicationDetails.guarantor_name, applicationDetails.guarantor_contact].filter(Boolean).join(' · ') || 'Not provided']
                    ].map(([label, value]) => (
                      <div key={label} className={`min-w-0 bg-white px-4 py-3 ${['Purpose', 'Collateral', 'Guarantor'].includes(label) ? 'sm:col-span-2' : ''}`}>
                        <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not provided'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {canReview && (
                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...selectedRequest, status: 'rejected' }); setSelectedRequest(null); }} className="min-h-10 rounded-lg border border-red-200 bg-white px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Reject application</button>
                    <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...selectedRequest, status: 'approved' }); setSelectedRequest(null); }} className="min-h-10 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-50">Approve application</button>
                  </div>
                )}
              </div>
            </section>
          </div>
        );
      })()}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Check aria-hidden="true" className="text-blue-700" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Approved loans ({approvedLoans.length})</h2>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder="Search member or loan" aria-label="Search approved loans by member or loan number" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <p>Manager approval does not release cash. A loan remains <strong>Awaiting for release</strong> until the Treasurer confirms and records the disbursement as <strong>Cash released</strong>.</p>
          {staff?.role === 'treasurer' ? (
            <Link to="/staff/cash-release" className="font-semibold text-blue-800 underline underline-offset-2">Open Cash Release</Link>
          ) : staff?.role === 'manager' ? (
            <Link to="/staff/transaction-approvals" className="font-semibold text-blue-800 underline underline-offset-2">Review release proof</Link>
          ) : staff?.role === 'bookkeeper' ? (
            <Link to="/staff/approved-transactions" className="font-semibold text-blue-800 underline underline-offset-2">Prepare approved loan</Link>
          ) : null}
        </div>
        {approvedLoans.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No approved loans to show.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Member</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Loan number</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Principal</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Installment</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Balance</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredApprovedLoans.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">No approved loans match “{loanSearch}”.</td></tr>
                ) : filteredApprovedLoans.map((loan) => (
                  <tr
                    key={loan.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View loan details for ${loan.loan_number}, ${fullName(memberOf(loan))}`}
                    onClick={() => setSelectedLoan(loan)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedLoan(loan);
                      }
                    }}
                    className="cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-900">{fullName(memberOf(loan))}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{loan.loan_number}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.principal_amount)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.installment_amount ?? loan.monthly_payment)} · {loan.payment_frequency}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.balance)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{loan.cashReleased ? 'Cash released' : 'Awaiting for release'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLoan && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedLoan(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="approved-loan-details-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {(() => {
              const application = requestData(selectedLoan.request);
              const member = memberOf(selectedLoan);
              const loanStatus = selectedLoan.cashReleased ? 'Cash released' : 'Awaiting for release';
              const detailRows = [
                ['Loan type', application.loan_type || 'Not specified'],
                ['Repayment term', `${selectedLoan.term_months} months`],
                ['Payment frequency', selectedLoan.payment_frequency || 'Not specified'],
                ['Installments', selectedLoan.installments ? `${selectedLoan.installments} payments` : 'Not available'],
                ['Installment amount', formatMoney(selectedLoan.installment_amount ?? selectedLoan.monthly_payment)],
                ['Annual interest rate', `${selectedLoan.interest_rate ?? 0}%`],
                ['Late-payment penalty rate', `${selectedLoan.penalty_rate ?? 0}%`],
              ];
              const dateRows = [
                ['Application date', selectedLoan.application_date],
                ['Approval date', selectedLoan.approval_date],
                ['Cash release date', selectedLoan.release_date],
                ['Maturity date', selectedLoan.maturity_date],
              ];
              const securityRows = [
                ['Collateral', [application.application_details?.collateral_type, application.application_details?.collateral_description].filter(Boolean).join(' — ')],
                ['Co-maker / guarantor', [application.application_details?.guarantor_name, application.application_details?.guarantor_contact].filter(Boolean).join(' · ')],
                ['Processing fee', formatMoney(application.application_details?.processing_fee)],
                ['Service fee', formatMoney(application.application_details?.service_fee)],
              ];
              const detailValue = (value) => value || 'Not provided';
              const displayDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not available';
              return (
                <>
                  <header className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 px-6 py-6 text-white sm:px-8">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Loan account</p>
                        <h2 id="approved-loan-details-title" className="mt-1 text-2xl font-bold">{selectedLoan.loan_number}</h2>
                        <p className="mt-2 text-sm text-blue-100">{fullName(member)}{member?.member_number ? ` · Member ${member.member_number}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => setSelectedLoan(null)} aria-label="Close loan details" className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white">
                        <X aria-hidden="true" size={20} />
                      </button>
                    </div>
                    <span className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedLoan.cashReleased ? 'bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-200/30' : 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/30'}`}>
                      <span className={`h-2 w-2 rounded-full ${selectedLoan.cashReleased ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                      {loanStatus}
                    </span>
                  </header>
                  <div className="max-h-[calc(92vh-170px)] space-y-6 overflow-y-auto bg-slate-50 p-6 sm:p-8">
                    <section aria-label="Loan financial summary" className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Principal</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(selectedLoan.principal_amount)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total interest</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(selectedLoan.total_interest)}</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Total payable</p>
                        <p className="mt-2 text-xl font-bold text-amber-950">{formatMoney(selectedLoan.total_amount)}</p>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Repayment details</h3>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {detailRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 font-semibold capitalize text-slate-900">{value}</dd>
                          </div>
                        ))}
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Current balance</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{formatMoney(selectedLoan.balance)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Penalties recorded</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{formatMoney(selectedLoan.penalty_total)}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Loan timeline</h3>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {dateRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 font-semibold text-slate-900">{displayDate(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Application information</h3>
                      {selectedLoan.request?.request_number && <p className="mt-1 text-xs text-slate-500">Request {selectedLoan.request.request_number}</p>}
                      <div className="mt-4">
                        <p className="text-xs font-medium text-slate-500">Purpose</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{detailValue(application.purpose || selectedLoan.notes)}</p>
                      </div>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {securityRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 text-sm font-medium text-slate-800">{detailValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="loan-review-title">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="loan-review-title" className="text-xl font-bold text-gray-900">{decision.status === 'approved' ? 'Approve loan application' : 'Reject loan application'}</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">{fullName(memberOf(decision))} · {formatMoney(decision.amount)}</p>
            {decision.status === 'approved' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Approval creates an approved loan record only. The loan becomes active and its repayment schedule starts only after the Treasurer records the actual disbursement as Cash released.</p>}
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Decision notes *
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" disabled={!!busyId} onClick={() => setDecision(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={!notes.trim() || !!busyId} onClick={submitDecision} className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${decision.status === 'approved' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'}`}>
                {busyId ? 'Saving...' : decision.status === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LoanRequests = () => {
  const { staff } = useAuth();
  return staff?.role === 'treasurer' ? <TreasurerApprovedTransactions /> : <LegacyLoanRequests />;
};

export default LoanRequests;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
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
  released: 'Cash released',
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
const dateLabel = (value) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })
  : '—';

const relation = (value) => Array.isArray(value) ? value[0] : value;
const isCreditSale = (workflow) => (
  workflow.transaction_type === 'sale' && workflow.payload?.p_sale?.payment_type === 'credit'
);
const salesReturnAmount = (workflow) => {
  const submittedReturnValue = workflow.payload?.p_returned_item_value;
  if (submittedReturnValue != null && Number.isFinite(Number(submittedReturnValue))) {
    return Number(submittedReturnValue);
  }

  const returnedItems = workflow.payload?.p_returned_items || [];
  const saleItems = workflow.saleRecord?.sales_order_items || [];
  if (!saleItems.length) return Number(workflow.amount || 0);

  const amount = returnedItems.reduce((total, returnedItem) => {
    const matchingItems = saleItems.filter((item) => item.product_id === returnedItem.product_id);
    const soldQuantity = matchingItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const itemValue = matchingItems.reduce((sum, item) => (
      sum + Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)))
    ), 0);
    if (!soldQuantity) return total;
    const returnedValue = Number(returnedItem.quantity || 0) * itemValue / soldQuantity;
    return total + Math.round(returnedValue * 100) / 100;
  }, 0);
  return amount;
};
const workflowDisplayAmount = (workflow) => workflow.transaction_type === 'sales_return'
  ? salesReturnAmount(workflow)
  : Number(workflow.amount || 0);
const workflowStatusLabel = (workflow) => (
  workflow.transaction_type === 'loan_disbursement' && workflow.status === 'completed'
    ? 'Cash released'
    : isCreditSale(workflow) && ['approved', 'completed'].includes(workflow.status)
      && !['paid', 'cancelled'].includes(workflow.saleRecord?.payment_status)
      ? 'Payable'
    : isCreditSale(workflow) && workflow.saleRecord?.payment_status === 'paid'
      ? 'Paid'
    : workflow.direction === 'cash_in' && workflow.status === 'completed'
      ? 'Cash received'
    : STATUS_LABELS[workflow.status] || workflow.status
);
const workflowStatusStyle = (workflow) => (
  isCreditSale(workflow) && ['approved', 'completed'].includes(workflow.status)
    && !['paid', 'cancelled'].includes(workflow.saleRecord?.payment_status)
    ? 'bg-amber-100 text-amber-900'
    : STATUS_STYLES[workflow.status] || 'bg-slate-100 text-slate-800'
);
const isCompletedCashIn = (workflow) => workflow.direction === 'cash_in' && workflow.status === 'completed';
const isPhysicalCashHandoff = (workflow) => {
  if (workflow.payment_method !== 'cash') return false;
  const cashAccount = workflow.payload?.p_entry?.cash_account || workflow.payload?.p_sale?.cash_account;
  if (cashAccount) return cashAccount === 'Cash on Hand';
  return (workflow.payload?.p_allocations || []).some((allocation) => (
    allocation.account === 'Cash on Hand' && allocation.side === 'debit'
  ));
};

const WorkflowEvidence = ({ document, onOpen }) => {
  const [signedUrl, setSignedUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const isImage = document.mime_type === 'image/jpeg' || document.mime_type === 'image/png';

  useEffect(() => {
    let active = true;
    supabase.storage
      .from('transaction-evidence')
      .createSignedUrl(document.object_name, 60)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPreviewError(error.message);
          return;
        }
        setSignedUrl(data.signedUrl);
      })
      .catch((error) => {
        if (active) setPreviewError(error.message || 'The evidence preview could not be loaded.');
      });
    return () => { active = false; };
  }, [document.object_name]);

  return (
    <div className="mt-2">
      {isImage && signedUrl && (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <img src={signedUrl} alt={`Release proof: ${document.file_name}`} className="max-h-72 w-full object-contain" />
        </a>
      )}
      {!signedUrl && previewError && <p className="text-xs text-amber-800">Preview unavailable: {previewError}</p>}
      {(!isImage || !signedUrl) && (
        <button type="button" onClick={() => onOpen(document)} className="text-xs font-semibold text-blue-800 underline underline-offset-2">
          {isImage ? 'Open proof image' : 'Open attached proof'}
        </button>
      )}
    </div>
  );
};

const profileDate = (value) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })
  : '—';

const profileValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const MemberProfileDisclosure = ({ memberId, transactionType }) => {
  const [expanded, setExpanded] = useState(false);
  const [member, setMember] = useState(null);
  const [savingsAccounts, setSavingsAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSavingsWithdrawal = transactionType === 'savings_withdrawal';

  useEffect(() => {
    if (!expanded || !memberId) return undefined;
    let active = true;

    const loadProfile = async () => {
      try {
        const [profileResult, accountsResult] = await Promise.all([
          supabase.from('members')
            .select(`
              member_number, first_name, middle_name, last_name, email, phone, address,
              date_of_birth, gender, marital_status, membership_type, membership_status,
              date_joined, shares_owned, total_capital, emergency_contact_name,
              emergency_contact_phone, emergency_contact_relationship,
              additional_emergency_contacts, family_members, rsbsa, tin, ncfrs,
              pca_id, occupation, barangay, municipality, province
            `)
            .eq('id', memberId)
            .maybeSingle(),
          isSavingsWithdrawal
            ? supabase.from('savings_accounts')
              .select('id, account_number, balance')
              .eq('member_id', memberId)
              .eq('account_type', 'regular')
              .eq('status', 'active')
              .order('created_at')
            : Promise.resolve({ data: [], error: null })
        ]);
        if (profileResult.error) throw profileResult.error;
        if (accountsResult.error) throw accountsResult.error;
        if (!profileResult.data) throw new Error('The linked member profile could not be found.');
        if (!active) return;
        setMember(profileResult.data);
        setSavingsAccounts(accountsResult.data || []);
      } catch (loadError) {
        if (!active) return;
        console.error('Unable to load transaction member profile:', loadError);
        setMember(null);
        setSavingsAccounts([]);
        setError(loadError.message || 'Member profile could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => { active = false; };
  }, [expanded, isSavingsWithdrawal, memberId]);

  if (!memberId) return null;

  const contacts = Array.isArray(member?.additional_emergency_contacts)
    ? member.additional_emergency_contacts
    : [];
  const familyMembers = Array.isArray(member?.family_members) ? member.family_members : [];
  const address = member
    ? [member.address, member.barangay, member.municipality, member.province].filter(Boolean).join(', ')
    : '';
  const sections = member ? [
    {
      title: 'Personal and contact information',
      fields: [
        ['Member number', member.member_number],
        ['Full name', [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ')],
        ['Date of birth', profileDate(member.date_of_birth)],
        ['Gender', member.gender],
        ['Marital status', member.marital_status],
        ['Email', member.email],
        ['Phone', member.phone],
        ['Address', address]
      ]
    },
    {
      title: 'Membership details',
      fields: [
        ['Membership status', member.membership_status],
        ['Membership type', member.membership_type],
        ['Date joined', profileDate(member.date_joined)],
        ['Shares owned', member.shares_owned],
        ['Share capital', member.total_capital === null ? null : money(member.total_capital)]
      ]
    },
    {
      title: 'Additional information',
      fields: [
        ['Occupation', member.occupation],
        ['RSBSA', member.rsbsa],
        ['TIN', member.tin],
        ['NCFRS', member.ncfrs],
        ['PCA ID', member.pca_id]
      ]
    },
    {
      title: 'Emergency contact',
      fields: [
        ['Name', member.emergency_contact_name],
        ['Phone', member.emergency_contact_phone],
        ['Relationship', member.emergency_contact_relationship]
      ]
    }
  ] : [];
  const savingsBalance = savingsAccounts.reduce((total, account) => total + Number(account.balance || 0), 0);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-blue-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (!expanded) {
            setLoading(true);
            setError('');
          }
          setExpanded(!expanded);
        }}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50/60"
      >
        <span>
          <span className="block font-semibold text-slate-900">Member profile</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {member ? `${[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ')} · ${member.member_number || 'No member number'}` : 'Expand to view the linked member’s details'}
          </span>
          {isSavingsWithdrawal && !expanded && member && (
            <span className="mt-1 block text-sm font-semibold tabular-nums text-blue-900">
              Current savings balance: {money(savingsBalance)}
            </span>
          )}
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-blue-100 p-4">
          {loading && <p role="status" className="text-sm text-slate-600">Loading member profile…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {member && (
            <div className="space-y-4">
              {isSavingsWithdrawal && (
                <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Current savings balance</h3>
                  <p className="mt-1 text-xl font-bold tabular-nums text-blue-950">{money(savingsBalance)}</p>
                  {savingsAccounts.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {savingsAccounts.map((account) => (
                        <li key={account.id} className="flex flex-wrap justify-between gap-2">
                          <span>{account.account_number}</span>
                          <span className="font-medium tabular-nums">{money(account.balance)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-600">No active regular savings accounts.</p>}
                </section>
              )}
              {sections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
                  <dl className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.fields.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-slate-500">{label}</dt>
                        <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">
                          {label === 'Share capital' ? value : profileValue(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {contacts.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Additional emergency contacts</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {contacts.map((contact, index) => (
                      <li key={`${contact?.name || 'contact'}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-medium text-slate-900">{profileValue(contact?.name)}</p>
                        <p className="mt-1 text-slate-600">{profileValue(contact?.phone)} · {profileValue(contact?.relationship)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {familyMembers.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Family members</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {familyMembers.map((familyMember, index) => (
                      <li key={`${familyMember?.name || familyMember?.full_name || 'family'}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-medium text-slate-900">{profileValue(familyMember?.name || familyMember?.full_name)}</p>
                        <p className="mt-1 text-slate-600">
                          {[familyMember?.relationship, familyMember?.age ? `Age ${familyMember.age}` : null, familyMember?.occupation]
                            .filter(Boolean).join(' · ') || '—'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

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
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionCounterparty, setCorrectionCounterparty] = useState('');
  const [correctionPaymentMethod, setCorrectionPaymentMethod] = useState('');
  const [correctionDescription, setCorrectionDescription] = useState('');
  const [correctionPayload, setCorrectionPayload] = useState('');
  const [reviewedRelease, setReviewedRelease] = useState(false);
  const [releaseFile, setReleaseFile] = useState(null);
  const registeredReleaseProof = selected?.documents
    ?.filter((document) => document.document_type === 'cash_release_acknowledgment')
    .sort((left, right) => new Date(right.uploaded_at) - new Date(left.uploaded_at))[0];
  const selectedReturnItems = selected?.transaction_type === 'sales_return'
    ? (selected.payload?.p_returned_items || []).map((returnedItem) => {
      const saleItems = selected.saleRecord?.sales_order_items?.filter((item) => item.product_id === returnedItem.product_id) || [];
      const saleItem = saleItems[0];
      const soldQuantity = saleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const totalLineValue = saleItems.reduce((sum, item) => (
        sum + Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)))
      ), 0);
      return {
        productId: returnedItem.product_id,
        description: saleItem?.product?.product_name || saleItem?.item_description || 'Sale item',
        quantity: Number(returnedItem.quantity || 0),
        soldQuantity,
        value: soldQuantity
          ? Math.round(Number(returnedItem.quantity || 0) * totalLineValue / soldQuantity * 100) / 100
          : 0,
      };
    })
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('transaction_workflows')
      .select(`
        id, transaction_type, direction, source_module, source_record_id, superseded_by, member_id,
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
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (isManager) query = query.neq('direction', 'cash_in');
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lt('created_at', `${dateTo}T23:59:59.999`);

    const { data, error: loadError } = await query;
    if (loadError) {
      console.error('Unable to load transaction workflow:', loadError);
      setError(`Unable to load transactions: ${loadError.message}`);
    } else {
      const workflows = (data || []).filter((workflow) => !isManager || !isCreditSale(workflow));
      const getRelatedSaleId = (workflow) => workflow.transaction_type === 'sales_return'
        ? workflow.source_record_id || workflow.payload?.p_sales_order_id
        : workflow.transaction_type === 'sale' && workflow.business_record_table === 'sales_orders'
          ? workflow.business_record_id
          : null;
      const saleIds = [...new Set(workflows.map(getRelatedSaleId).filter(Boolean))];
      if (saleIds.length) {
        const { data: sales, error: salesError } = await supabase
          .from('sales_orders')
          .select('id, order_number, customer_name, member_id, order_date, due_date, net_amount, amount_paid, payment_status, sales_order_items(product_id, item_description, quantity, unit_price, line_total, product:products(product_name))')
          .in('id', saleIds);
        if (salesError) {
          console.error('Unable to load related sale details:', salesError);
          setError(`Unable to load related sale details: ${salesError.message}`);
          setRows(workflows.map((workflow) => ({
            ...workflow,
            saleRecord: workflow.transaction_type === 'sales_return'
              ? {
                order_number: workflow.payload?.p_sales_order_number,
                customer_name: workflow.payload?.p_customer_name,
              }
              : null,
          })));
        } else {
          const salesById = new Map((sales || []).map((sale) => [sale.id, sale]));
          setRows(workflows.map((workflow) => ({
            ...workflow,
            saleRecord: salesById.get(getRelatedSaleId(workflow)) || (
              workflow.transaction_type === 'sales_return'
                ? {
                  order_number: workflow.payload?.p_sales_order_number,
                  customer_name: workflow.payload?.p_customer_name,
                }
                : null
            ),
          })));
        }
      } else {
        setRows(workflows);
      }
    }
    setLoading(false);
  }, [dateFrom, dateTo, isManager]);

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
        row.saleRecord?.order_number,
        row.saleRecord?.customer_name,
        row.transaction_type,
        row.source_module,
        requester,
        row.id,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(term));
    });
  }, [rows, search, statusFilter, typeFilter]);

  const todayRows = rows.filter((row) => row.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const pendingCount = rows.filter((row) => ['pending_approval', 'returned_for_correction'].includes(row.status)).length;
  const approvedToday = todayRows.filter((row) => row.manager_id && (row.status === 'approved' || row.status === 'completed')).length;
  const rejectedToday = todayRows.filter((row) => row.status === 'rejected').length;
  const pendingAmount = rows
    .filter((row) => ['pending_approval', 'returned_for_correction'].includes(row.status))
    .reduce((total, row) => total + workflowDisplayAmount(row), 0);

  const runRpc = async (functionName, params, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc(functionName, params);
      if (rpcError) throw rpcError;
      if (data?.status === 'accounting_error' || data?.error) {
        const processingError = data.error || 'Accounting could not complete this transaction.';
        setSelected((current) => current && current.id === params.p_workflow_id
          ? { ...current, status: 'accounting_error', accounting_status: 'error' }
          : current);
        await load();
        setError(processingError);
        return;
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

  const openWorkflowDetails = (workflow) => {
    setSelected(workflow);
    setError('');
    setRemarks('');
    if (isBookkeeper && workflow.status === 'returned_for_correction') {
      setCorrectionAmount(String(workflow.amount));
      setCorrectionCounterparty(workflow.counterparty_name || '');
      setCorrectionPaymentMethod(workflow.payment_method === 'bank_transfer' ? 'bank_transfer' : 'cash');
      setCorrectionDescription(workflow.description || '');
      setCorrectionPayload(JSON.stringify(workflow.payload || {}, null, 2));
    }
  };

  const resubmitCorrection = async () => {
    if (!selected) return;
    let payload;
    try {
      payload = JSON.parse(correctionPayload);
    } catch {
      setError('Transaction details must be valid JSON. Correct the details and try again.');
      return;
    }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      setError('Transaction details must be a JSON object.');
      return;
    }
    const amount = Number(correctionAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !correctionDescription.trim()) {
      setError('Enter a positive amount and transaction description.');
      return;
    }
    await runRpc(
      'resubmit_returned_transaction_workflow',
      {
        p_workflow_id: selected.id,
        p_counterparty_name: correctionCounterparty.trim() || null,
        p_amount: amount,
        p_payment_method: correctionPaymentMethod || null,
        p_description: correctionDescription.trim(),
        p_payload: payload,
      },
      'Corrected transaction resubmitted for Manager review.',
    );
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
      workflow.status === 'accounting_error'
        ? 'retry_transaction_workflow_processing'
        : 'process_transaction_workflow',
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
    if (!selected || !reviewedRelease || (!releaseFile && !registeredReleaseProof)) {
      setError('Review the recipient and approved amount, and attach proof before releasing.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const documentId = releaseFile
        ? await uploadReleaseProof(selected, releaseFile)
        : registeredReleaseProof.id;
      const { data: result, error: confirmError } = await supabase.rpc('confirm_transaction_workflow_release', {
        p_workflow_id: selected.id,
        p_document_id: documentId,
        p_remarks: remarks.trim() || null,
      });
      if (confirmError) throw confirmError;
      if (result?.status !== 'completed') {
        throw new Error(result?.error || 'The server did not confirm the release.');
      }
      if (!result.business_record_id || !result.journal_entry_id) {
        throw new Error('The server did not return the recorded disbursement and journal entry.');
      }
      setNotice(selected.transaction_type === 'loan_disbursement'
        ? 'Loan disbursed and recorded as Cash released. The Manager and Bookkeeper can review the transaction and proof.'
        : 'Cash released. The Manager and Bookkeeper can now review the completed transaction and attached proof.');
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
      ? ['all', 'returned_for_correction', 'approved', 'processing', 'awaiting_release', 'accounting_error', 'completed']
      : ['all', 'awaiting_release', 'on_hold', 'release_issue', 'released', 'completed'];

  return (
    <div className="space-y-6">
      <header className={`rounded-2xl px-6 py-6 shadow-sm sm:px-8 ${
        isTreasurer
          ? 'bg-gradient-to-br from-[#142b57] via-[#1c3d76] to-[#244b86] text-white'
          : isBookkeeper
            ? 'bg-gradient-to-br from-[#28134b] via-[#4b2678] to-[#7544a5] text-white'
            : isManager
              ? 'bg-gradient-to-br from-orange-200 via-orange-300 to-orange-400 text-orange-950'
              : 'bg-slate-950 text-white'
      }`}>
        <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isBookkeeper ? 'text-purple-200' : isManager ? 'text-orange-900' : 'text-amber-300'}`}>AMCOMS · Transaction Control</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {isManager ? 'Transactions Management' : isBookkeeper ? 'Accounting Processing' : 'Cash Release & Verification'}
            </h1>
            <p className={`mt-2 max-w-3xl text-sm ${isManager ? 'text-orange-950/75' : 'text-slate-300'}`}>
              {isManager
                ? 'Review submitted transactions and record an auditable decision before accounting begins.'
                : isBookkeeper
                  ? 'Incoming cash receipts are recorded automatically. Correct returned transactions and resubmit them for Manager review; process approved cash-outs and track settlement.'
                  : 'Verify the approved payee and amount, attach proof, and confirm the actual release.'}
            </p>
          </div>
          <button type="button" onClick={load} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${isManager ? 'border-orange-900/20 bg-white/50 text-orange-950 hover:bg-white/75' : 'border-slate-600 hover:bg-slate-800'}`}>
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
          {['Submitted', 'Manager Approved', 'Bookkeeper Processed', ...(isTreasurer ? ['Treasurer Released'] : []), 'Completed'].map((step) => (
            <span key={step} className={`rounded-full border px-3 py-1.5 ${isManager ? 'border-orange-900/15 bg-white/45 text-orange-950' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>{step}</span>
          ))}
        </div>
      </header>

      {error && !selected && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
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
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="block min-w-0 text-sm text-slate-600 md:col-span-2 xl:col-span-2">
            Search
            <span className="relative mt-1 block">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, requester, or payee"
                aria-label="Search transactions by reference, requester, or payee"
                className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </span>
          </label>
          <label className="min-w-0 text-sm text-slate-600">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              {visibleStatuses.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status === 'completed' ? 'Completed / Payable / Cash released' : STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm text-slate-600">
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              <option value="all">All types</option>
              {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-3 md:col-span-2 xl:col-span-2">
            <label className="min-w-0 text-sm text-slate-600">From
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
            </label>
            <label className="min-w-0 text-sm text-slate-600">To
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
            </label>
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
                  const requiresProcessing = isBookkeeper && row.status === 'approved' && !isCreditSale(row);
                  const actionable = (isManager && ['pending_approval', 'returned_for_correction'].includes(row.status))
                    || (isBookkeeper && row.status === 'returned_for_correction')
                    || requiresProcessing
                    || (isTreasurer && ['awaiting_release', 'on_hold', 'release_issue'].includes(row.status));
                  return (
                    <tr key={row.id} className="cursor-pointer hover:bg-blue-50/60" onClick={() => openWorkflowDetails(row)}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{TYPE_LABELS[row.transaction_type] || row.transaction_type}</p>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                          {row.transaction_type === 'sales_return' && row.saleRecord?.order_number
                            ? `Credit sale ${row.saleRecord.order_number}`
                            : row.description}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {row.transaction_type === 'sales_return'
                            ? row.source_module
                            : `${row.source_module} · ${row.id.slice(0, 8).toUpperCase()}`}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{row.counterparty_name || row.saleRecord?.customer_name || requester}</p>
                        {row.member_id && <p className="mt-1 text-xs text-slate-500">Member-linked</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900">{money(workflowDisplayAmount(row))}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{dateTime(row.created_at)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${workflowStatusStyle(row)}`}>
                            {workflowStatusLabel(row)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button type="button" onClick={(event) => { event.stopPropagation(); openWorkflowDetails(row); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${actionable ? 'bg-slate-900 text-white hover:bg-slate-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                          {actionable ? isManager ? 'Review' : isBookkeeper ? row.status === 'returned_for_correction' ? 'Edit & resubmit' : 'Process' : 'Verify release' : 'View details'}
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
            <header className={`flex items-start justify-between gap-4 px-5 py-5 sm:px-7 ${isManager ? 'bg-gradient-to-br from-orange-200 via-orange-300 to-orange-400 text-orange-950' : isBookkeeper ? 'bg-gradient-to-br from-[#28134b] via-[#4b2678] to-[#7544a5] text-white' : isTreasurer ? 'bg-gradient-to-br from-[#142b57] via-[#1c3d76] to-[#244b86] text-white' : 'bg-slate-950 text-white'}`}>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${isManager ? 'text-orange-900' : isBookkeeper ? 'text-purple-200' : 'text-amber-300'}`}>{TYPE_LABELS[selected.transaction_type] || selected.transaction_type}</p>
                <h2 id="workflow-detail-title" className="mt-1 text-xl font-bold sm:text-2xl">
                  {selected.counterparty_name
                    || selected.saleRecord?.customer_name
                    || (selected.transaction_type === 'sales_return' && selected.saleRecord?.order_number
                      ? `Credit sale ${selected.saleRecord.order_number}`
                      : selected.description)}
                </h2>
                <p className={`mt-1 text-sm ${isManager ? 'text-orange-950/75' : 'text-slate-300'}`}>{selected.source_module} · submitted {dateTime(selected.created_at)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} disabled={busy} aria-label="Close transaction details" className={`rounded-lg p-2 ${isManager ? 'text-orange-900 hover:bg-white/40 hover:text-orange-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>×</button>
            </header>
            <div className="overflow-y-auto p-5 sm:p-7">
              {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(isCompletedCashIn(selected)
                  ? [
                    [selected.transaction_type === 'sales_return' ? 'Returned-item value' : 'Requested amount', money(workflowDisplayAmount(selected))],
                    ['Direction', selected.direction.replace('_', ' ')],
                    ['Payment method', selected.payment_method || 'Not specified'],
                    ['Status', 'Cash received'],
                    ['Submitted', dateTime(selected.created_at)],
                    ['Cash received', dateTime(selected.processed_at)],
                  ]
                  : [
                    [selected.transaction_type === 'sales_return' ? 'Returned-item value' : 'Approved / requested amount', money(workflowDisplayAmount(selected))],
                    [selected.transaction_type === 'sales_return' ? 'Accounting effect' : 'Direction', selected.transaction_type === 'sales_return' ? 'Reverse credit sale' : selected.direction.replace('_', ' ')],
                    ['Payment method', selected.transaction_type === 'sales_return' ? 'Not applicable' : selected.payment_method || 'Not specified'],
                    ['Workflow status', workflowStatusLabel(selected)],
                    ['Approved by', isCreditSale(selected) ? 'Not required' : relation(selected.approver)?.full_name || 'Not yet approved'],
                    ['Manager decision', isCreditSale(selected) ? 'Not required' : dateTime(selected.manager_decision_at)],
                    ['Bookkeeper processing', selected.processed_at ? dateTime(selected.processed_at) : selected.accounting_status.replace('_', ' ')],
                    ['Cash release', selected.cash_release_required
                      ? selected.cash_release_status === 'released' ? 'Cash released' : selected.cash_release_status.replaceAll('_', ' ')
                      : 'Not required'],
                    ...(isCreditSale(selected) ? [
                      ['Due date', dateLabel(selected.saleRecord?.due_date || selected.payload?.p_sale?.due_date || selected.approved_payload?.p_sale?.due_date)],
                      ['Outstanding balance', money(Math.max(
                        Number(selected.saleRecord?.net_amount ?? selected.amount) - Number(selected.saleRecord?.amount_paid || 0),
                        0,
                      ))],
                    ] : []),
                  ]).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              {isManager && selected.member_id && (
                <MemberProfileDisclosure
                  key={selected.member_id}
                  memberId={selected.member_id}
                  transactionType={selected.transaction_type}
                />
              )}
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                {selected.transaction_type === 'sales_return' ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Connected original record</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900">Credit sale {selected.saleRecord?.order_number || selected.payload?.p_sales_order_number || 'Reference unavailable'}</h3>
                        <p className="mt-1 text-sm text-slate-600">{selected.saleRecord?.customer_name || selected.payload?.p_customer_name || selected.counterparty_name || 'Customer not recorded'}</p>
                      </div>
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">Cancellation request</span>
                    </div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-xs font-medium text-slate-500">Original sale date</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-900">{dateLabel(selected.saleRecord?.order_date)}</dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-xs font-medium text-slate-500">Payment status</dt>
                        <dd className="mt-1 text-sm font-semibold capitalize text-slate-900">{selected.saleRecord?.payment_status || 'Unpaid credit sale'}</dd>
                      </div>
                      <div className="rounded-lg bg-orange-50 p-3">
                        <dt className="text-xs font-medium text-orange-800">Returned-item value</dt>
                        <dd className="mt-1 text-sm font-bold text-orange-950">{money(workflowDisplayAmount(selected))}</dd>
                      </div>
                    </dl>
                    <section className="mt-4">
                      <h4 className="text-sm font-semibold text-slate-900">Physical items to return to stock</h4>
                      {selectedReturnItems.length ? (
                        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                          {selectedReturnItems.map((item) => (
                            <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                              <span className="font-medium text-slate-800">{item.description}</span>
                              <span className="text-right text-slate-600">Returning <strong className="text-slate-900">{item.quantity}</strong>{item.soldQuantity ? ` of ${item.soldQuantity} sold` : ''}<span className="block font-semibold text-slate-900">{money(item.value)}</span></span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">No physical items were marked for return. This request reverses the credit sale without restoring inventory.</p>
                      )}
                    </section>
                    <section className="mt-4 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
                      <h4 className="text-sm font-semibold text-orange-950">Bookkeeper’s cancellation reason</h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{selected.payload?.p_reason || 'No cancellation reason was included in this request.'}</p>
                    </section>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-slate-900">Purpose and submitted details</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.description}</p>
                  </>
                )}
                {selected.manager_remarks && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><strong>Manager remarks:</strong> {selected.manager_remarks}</p>}
                {selected.journal_entry_id && <p className="mt-3 text-sm text-slate-600">Journal entry: <span className="font-mono">{selected.journal_entry_id}</span></p>}
                {selected.transaction_type === 'loan_disbursement' && (() => {
                  const loan = selected.approved_payload || selected.payload || {};
                  const application = loan.request_data || {};
                  return (
                    <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                      <h3 className="font-semibold text-slate-900">Approved loan details</h3>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        {[
                          ['Loan number', loan.loan_number],
                          ['Principal', money(loan.principal_amount || selected.amount)],
                          ['Term', loan.term_months ? `${loan.term_months} months` : null],
                          ['Payment frequency', loan.payment_frequency],
                          ['Installment amount', loan.installment_amount ? money(loan.installment_amount) : null],
                          ['Total interest', loan.total_interest ? money(loan.total_interest) : null],
                          ['Total payable', loan.total_amount ? money(loan.total_amount) : null],
                          ['Purpose', application.purpose || loan.notes],
                          ['Collateral', [application.application_details?.collateral_type, application.application_details?.collateral_description].filter(Boolean).join(' — ')],
                          ['Co-maker / guarantor', [application.application_details?.guarantor_name, application.application_details?.guarantor_contact].filter(Boolean).join(' · ')],
                        ].filter(([, value]) => value).map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  );
                })()}
              </div>

              {isBookkeeper && selected.status === 'returned_for_correction' && (
                <section className="mt-5 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div>
                    <h3 className="font-semibold text-amber-950">Correct and resubmit</h3>
                    <p className="mt-1 text-sm text-amber-900">
                      Update the transaction details requested by the Manager. Resubmission creates a new review record and keeps the returned transaction in the audit history.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Payee / counterparty
                      <input value={correctionCounterparty} onChange={(event) => setCorrectionCounterparty(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Amount
                      <input type="number" min="0.01" step="0.01" value={correctionAmount} onChange={(event) => setCorrectionAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Cash account
                      <select value={correctionPaymentMethod} onChange={(event) => setCorrectionPaymentMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                        <option value="cash">Cash on Hand</option>
                        <option value="bank_transfer">Cash in Bank</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Description
                      <textarea value={correctionDescription} onChange={(event) => setCorrectionDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                    </label>
                    <details className="sm:col-span-2">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced transaction details</summary>
                      <label className="mt-2 block text-sm font-medium text-slate-700">
                        Transaction data (JSON)
                        <textarea value={correctionPayload} onChange={(event) => setCorrectionPayload(event.target.value)} rows={10} spellCheck="false" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs" />
                        <span className="mt-1 block text-xs font-normal text-slate-600">Change only the fields requested by the Manager. The server validates these details against the transaction type and amount.</span>
                      </label>
                    </details>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" disabled={busy} onClick={resubmitCorrection} className="rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-950 disabled:opacity-50">
                      {busy ? 'Resubmitting…' : 'Resubmit for Manager review'}
                    </button>
                  </div>
                </section>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Supporting documents</h3>
                  {!selected.documents?.length ? <p className="mt-2 text-sm text-slate-500">No documents attached.</p> : (
                    <ul className="mt-2 space-y-2">
                      {selected.documents.map((document) => (
                        <li key={document.id} className="rounded-lg bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700"><FileText size={16} className="shrink-0 text-slate-500" /><span className="truncate">{document.file_name}</span></span>
                            <button type="button" onClick={() => createDocumentLink(document)} className="rounded p-1 text-blue-800 hover:bg-blue-50" aria-label={`Open ${document.file_name}`}><Download size={16} /></button>
                          </div>
                          <WorkflowEvidence document={document} onOpen={createDocumentLink} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {isTreasurer && selected.cash_release_required && ['awaiting_release', 'on_hold', 'release_issue'].includes(selected.status) && (
                    <label className="mt-4 block text-sm font-medium text-slate-700">
                      Photo or proof of release (PDF, JPG, PNG; up to 10 MB){registeredReleaseProof ? ' — proof already attached' : ' *'}
                      <input type="file" accept="application/pdf,image/jpeg,image/png" capture="environment" onChange={(event) => setReleaseFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      {registeredReleaseProof && !releaseFile && (
                        <span className="mt-1 block text-xs font-normal text-emerald-800">
                          Using the attached proof: {registeredReleaseProof.file_name}
                        </span>
                      )}
                    </label>
                  )}
                </section>
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Workflow history</h3>
                  {!selected.events?.length ? <p className="mt-2 text-sm text-slate-500">No event history available.</p> : (
                    <ol className="mt-4">
                      {[...selected.events]
                        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at))
                        .filter((event) => !isCompletedCashIn(selected)
                          || event.event_type === 'submitted'
                          || (event.event_type === 'processed' && event.next_status === 'completed'))
                        .map((event, index, events) => (
                        <li key={event.id} className="relative flex gap-3 pb-5 text-sm last:pb-0">
                          {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-3 w-px bg-slate-200" />}
                          <span aria-hidden="true" className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-blue-500 bg-white" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <strong className="font-semibold capitalize text-slate-800">
                                {isCompletedCashIn(selected) && event.event_type === 'processed'
                                  ? 'Cash received'
                                  : event.event_type.replaceAll('_', ' ')}
                              </strong>
                              <time className="text-xs text-slate-500">{dateTime(event.created_at)}</time>
                            </span>
                            {event.remarks && <span className="mt-1 block whitespace-pre-wrap text-slate-600">{event.remarks}</span>}
                          </span>
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
                  <label className="mt-3 block text-sm font-medium text-slate-700">Remarks (required to reject or return for correction)
                    <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Reason, approval notes, or correction instructions" />
                  </label>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => submitDecision('returned_for_correction')} className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50">Return for correction</button>
                    <button type="button" disabled={busy} onClick={() => submitDecision('rejected')} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Reject</button>
                    <button type="button" disabled={busy} onClick={() => submitDecision('approved')} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Check size={16} /> Approve</button>
                  </div>
                </section>
              )}

              {isBookkeeper && ['approved', 'accounting_error'].includes(selected.status) && !isCreditSale(selected) && (
                <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-blue-950">{selected.status === 'accounting_error' ? 'Accounting processing failed' : 'Ready for accounting processing'}</h3>
                    <p className="mt-1 text-sm text-blue-900">{selected.status === 'accounting_error'
                      ? 'The failed attempt was rolled back. Review the error above, correct the underlying issue if needed, then retry processing.'
                      : 'This action validates and posts using the existing transaction-specific business and accounting logic.'}</p>
                    {error && <p role="alert" className="mt-2 break-words rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-800">{error}</p>}
                  </div>
                  <button type="button" disabled={busy} onClick={() => processTransaction(selected)} className="shrink-0 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50">{busy ? 'Processing…' : selected.status === 'accounting_error' ? 'Retry processing' : selected.cash_release_required ? 'Prepare for release' : 'Process transaction'}</button>
                </section>
              )}

              {isTreasurer && selected.cash_release_required && ['awaiting_release', 'on_hold', 'release_issue'].includes(selected.status) && (
                <section className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-emerald-800" size={20} />
                    <div><h3 className="font-semibold text-emerald-950">Release approved loan</h3><p className="mt-1 text-sm text-emerald-900">Verify the recipient and approved amount, attach a photo or proof, then select Release. The server uses the approved amount and will not release without a registered attachment.</p></div>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" checked={reviewedRelease} onChange={(event) => setReviewedRelease(event.target.checked)} className="mt-1" />
                    I verified the recipient and approved amount of <strong>{money(selected.amount)}</strong>.
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Release note or issue reason
                    <span className="ml-1 font-normal text-slate-500">(required for hold or issue; optional for release)</span>
                    <input
                      value={remarks}
                      onChange={(event) => {
                        setRemarks(event.target.value);
                        if (error) setError('');
                      }}
                      aria-describedby="release-note-help"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                    <span id="release-note-help" className="mt-1 block text-xs font-normal text-slate-500">
                      Explain why the release is on hold or what discrepancy you found.
                    </span>
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => { if (!remarks.trim()) { setError('Enter a reason before placing this release on hold.'); return; } runRpc('place_transaction_workflow_on_hold', { p_workflow_id: selected.id, p_reason: remarks.trim() }, 'Transaction placed on hold.'); }} className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Place on hold</button>
                    <button type="button" disabled={busy} onClick={() => { if (!remarks.trim()) { setError('Enter the discrepancy before reporting this issue.'); return; } runRpc('report_transaction_workflow_release_issue', { p_workflow_id: selected.id, p_reason: remarks.trim() }, 'Release issue recorded for review.'); }} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"><AlertTriangle size={16} /> Report issue</button>
                    <button type="button" disabled={busy || !reviewedRelease || (!releaseFile && !registeredReleaseProof)} onClick={confirmRelease} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? 'Releasing…' : 'Release'}</button>
                  </div>
                </section>
              )}

              {isTreasurer && selected.direction === 'cash_in' && selected.status === 'completed' && (
                <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="font-semibold text-blue-950">Bookkeeper cash handoff</h3>
                  {isPhysicalCashHandoff(selected) ? (
                    selected.events?.some((event) => event.event_type === 'cash_received_verified') ? (
                      <p className="mt-1 text-sm font-medium text-emerald-900">
                        Cash handoff confirmed by the Treasurer
                        {' · '}
                        {dateTime(selected.events.find((event) => event.event_type === 'cash_received_verified').created_at)}
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-blue-900">Confirm this cash was physically received from the Bookkeeper. This does not change or post the transaction again.</p>
                        <button type="button" disabled={busy} onClick={() => runRpc('verify_transaction_workflow_cash_received', { p_workflow_id: selected.id, p_remarks: remarks.trim() || null }, 'Cash handoff confirmation recorded.')} className="mt-3 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm cash handoff</button>
                      </>
                    )
                  ) : (
                    <p className="mt-1 text-sm text-blue-900">This transaction was not recorded as cash deposited to Cash on Hand. No physical cash handoff confirmation is available.</p>
                  )}
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

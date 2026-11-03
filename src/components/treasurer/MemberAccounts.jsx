import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import MemberReportSort from '../common/MemberReportSort';

const PAGE_SIZE = 50;

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatDate = (value) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—';

const getMemberName = (member) => [
  member.first_name,
  member.middle_name,
  member.last_name
].filter(Boolean).join(' ');

const cashInTypeLabel = (transactionType) => ({
  loan_payment: 'Loan payment',
  savings_deposit: 'Savings deposit',
  time_deposit: 'Time deposit',
  capital_contribution: 'Capital contribution',
  sale: 'Sale',
  other_receipt: 'Other receipt'
}[transactionType] || 'Cash receipt');

const isPhysicalCashReceipt = (receipt) => {
  const account = Array.isArray(receipt.account) ? receipt.account[0] : receipt.account;
  return receipt.payment_method === 'cash'
    && account?.account_name?.trim().toLowerCase() === 'cash on hand';
};

const MemberAccountDetails = ({ member, accounts, loans }) => {
  const [receipts, setReceipts] = useState([]);
  const [disbursements, setDisbursements] = useState([]);
  const [verifiedReceipts, setVerifiedReceipts] = useState(new Set());
  const [transactionTypeByReceipt, setTransactionTypeByReceipt] = useState(new Map());
  const [pendingReleases, setPendingReleases] = useState([]);
  const [loanSchedules, setLoanSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadDetails = async () => {
      setLoading(true);
      setError('');
      try {
        const loanIds = (loans || []).map((loan) => loan.id);
        const [receiptResult, disbursementResult, releaseResult, scheduleResult] = await Promise.all([
          supabase.from('cash_receipts')
            .select('id, receipt_number, receipt_date, received_from, amount, payment_method, description, created_at, account:chart_of_accounts(account_name)')
            .eq('member_id', member.id)
            .eq('status', 'recorded')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase.from('cash_disbursements')
            .select('id, voucher_number, disbursement_date, payee, amount, payment_method, description, created_at')
            .eq('member_id', member.id)
            .eq('status', 'recorded')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase.from('transaction_workflows')
            .select('id, amount, description, payment_method, status, cash_release_status, created_at')
            .eq('member_id', member.id)
            .eq('direction', 'cash_out')
            .eq('cash_release_required', true)
            .in('status', ['awaiting_release', 'on_hold', 'release_issue'])
            .order('created_at', { ascending: false }),
          loanIds.length
            ? supabase.from('loan_schedule')
              .select('id, loan_id, due_date, amount_due, amount_paid, penalty_amount, status')
              .in('loan_id', loanIds)
              .neq('status', 'paid')
              .order('due_date', { ascending: true })
            : Promise.resolve({ data: [], error: null })
        ]);
        const failed = [receiptResult, disbursementResult, releaseResult, scheduleResult].find((result) => result.error);
        if (failed) throw failed.error;

        const receiptRows = receiptResult.data || [];
        let verifiedReceiptIds = new Set();
        let receiptTransactionTypes = new Map();
        if (receiptRows.length) {
          const saleOrdersResult = await supabase.from('sales_orders')
            .select('id, cash_receipt_id')
            .in('cash_receipt_id', receiptRows.map((receipt) => receipt.id));
          if (saleOrdersResult.error) throw saleOrdersResult.error;
          const receiptIdByWorkflowRecord = new Map(receiptRows.map((receipt) => [receipt.id, receipt.id]));
          (saleOrdersResult.data || []).forEach((sale) => {
            receiptIdByWorkflowRecord.set(sale.id, sale.cash_receipt_id);
          });
          const workflowResult = await supabase.from('transaction_workflows')
            .select('business_record_id, transaction_type, events:transaction_workflow_events(event_type)')
            .eq('direction', 'cash_in')
            .eq('status', 'completed')
            .in('business_record_id', [...receiptIdByWorkflowRecord.keys()]);
          if (workflowResult.error) throw workflowResult.error;
          verifiedReceiptIds = new Set((workflowResult.data || [])
            .filter((workflow) => (workflow.events || []).some((event) => event.event_type === 'cash_received_verified'))
            .map((workflow) => receiptIdByWorkflowRecord.get(workflow.business_record_id))
            .filter(Boolean));
          receiptTransactionTypes = new Map((workflowResult.data || []).map((workflow) => [
            receiptIdByWorkflowRecord.get(workflow.business_record_id),
            workflow.transaction_type
          ]).filter(([receiptId]) => receiptId));
        }

        if (!active) return;
        setReceipts(receiptRows);
        setTransactionTypeByReceipt(receiptTransactionTypes);
        setDisbursements(disbursementResult.data || []);
        setVerifiedReceipts(verifiedReceiptIds);
        setPendingReleases(releaseResult.data || []);
        setLoanSchedules(scheduleResult.data || []);
      } catch (loadError) {
        if (!active) return;
        console.error('Unable to load Treasurer member cash details:', loadError);
        setError(getDataLoadErrorMessage(loadError, 'member cash activity and release details'));
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDetails();
    return () => { active = false; };
  }, [member.id, loans]);

  const activities = [
    ...receipts.map((receipt) => {
      const verified = verifiedReceipts.has(receipt.id);
      const isCash = isPhysicalCashReceipt(receipt);
      return {
        id: `receipt-${receipt.id}`,
        date: receipt.receipt_date || receipt.created_at,
        type: cashInTypeLabel(transactionTypeByReceipt.get(receipt.id)),
        reference: receipt.receipt_number,
        description: receipt.description || receipt.received_from,
        amount: Number(receipt.amount || 0),
        status: isCash
          ? verified ? 'Treasurer verified' : 'Awaiting Treasurer handoff'
          : receipt.payment_method === 'cash' ? 'Recorded · not Cash on Hand' : 'Recorded · non-cash',
        statusTone: isCash && !verified ? 'text-amber-800' : 'text-emerald-800'
      };
    }),
    ...disbursements.map((disbursement) => ({
      id: `disbursement-${disbursement.id}`,
      date: disbursement.disbursement_date || disbursement.created_at,
      type: 'Cash released',
      reference: disbursement.voucher_number,
      description: disbursement.description || disbursement.payee,
      amount: -Number(disbursement.amount || 0),
      status: 'Recorded',
      statusTone: 'text-slate-600'
    }))
  ].sort((left, right) => new Date(right.date) - new Date(left.date)).slice(0, 10);
  const latestPayment = receipts[0];

  return (
    <div className="grid grid-cols-1 gap-6 border-t border-gray-200 bg-gray-50 p-5 xl:grid-cols-2">
      <div className="space-y-5">
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900">Account information</h4>
            {member.phone && <p className="text-sm text-gray-600">Contact: {member.phone}</p>}
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500">No savings accounts recorded.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Maturity</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{account.account_number}</td>
                      <td className="px-3 py-2 capitalize text-gray-700">{account.account_type.replaceAll('_', ' ')}</td>
                      <td className="px-3 py-2 capitalize text-gray-600">{account.status}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(account.maturity_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{formatMoney(account.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Loan accounts</h4>
          {loans?.length ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Loan</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Next due</th>
                    <th className="px-3 py-2">Maturity</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.map((loan) => {
                    const nextDue = loanSchedules.find((schedule) => (
                      schedule.loan_id === loan.id
                      && Number(schedule.amount_due || 0) + Number(schedule.penalty_amount || 0) > Number(schedule.amount_paid || 0)
                    ));
                    return (
                      <tr key={loan.id}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{loan.loan_number}</td>
                        <td className="px-3 py-2 capitalize text-gray-600">{loan.status}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(nextDue?.due_date)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(loan.maturity_date)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{formatMoney(loan.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No loan records found.</p>
          )}
        </section>

        <section className="rounded-lg border border-emerald-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900">Latest member payment</h4>
          {loading ? <p className="mt-2 text-sm text-gray-500">Loading payment details…</p> : latestPayment ? (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-gray-500">Amount:</span> <strong>{formatMoney(latestPayment.amount)}</strong></p>
              <p><span className="text-gray-500">Date:</span> {formatDate(latestPayment.receipt_date)}</p>
              <p><span className="text-gray-500">Receipt:</span> <span className="font-mono">{latestPayment.receipt_number}</span></p>
              <p><span className="text-gray-500">Method:</span> <span className="capitalize">{latestPayment.payment_method?.replaceAll('_', ' ') || '—'}</span></p>
              <p className={`sm:col-span-2 ${isPhysicalCashReceipt(latestPayment) && !verifiedReceipts.has(latestPayment.id) ? 'font-semibold text-amber-800' : 'font-semibold text-emerald-800'}`}>
                {isPhysicalCashReceipt(latestPayment)
                  ? verifiedReceipts.has(latestPayment.id) ? 'Treasurer verified the cash handoff' : 'Cash handoff not yet verified by Treasurer'
                  : latestPayment.payment_method === 'cash' ? 'Recorded to an account other than Cash on Hand' : 'Recorded non-cash payment'}
              </p>
            </div>
          ) : <p className="mt-2 text-sm text-gray-500">No recorded payments found.</p>}
        </section>
      </div>

      <div className="space-y-5">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900">Pending cash releases</h4>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pendingReleases.length ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'}`}>
              {loading ? '…' : pendingReleases.length}
            </span>
          </div>
          {loading ? <p className="text-sm text-gray-500">Loading release status…</p> : pendingReleases.length ? (
            <ul className="space-y-2">
              {pendingReleases.map((release) => (
                <li key={release.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-gray-900">{formatMoney(release.amount)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-900">{release.status.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{release.description}</p>
                  <p className="mt-1 text-xs text-gray-500">Submitted {formatDate(release.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">No approved cash releases are awaiting action.</p>}
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Recent cash activity</h4>
          {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {loading ? <p className="text-sm text-gray-500">Loading cash activity…</p> : activities.length ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date / receipt</th>
                    <th className="px-3 py-2">Activity</th>
                    <th className="px-3 py-2">Payment status</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td className="px-3 py-2">
                        <p className="whitespace-nowrap text-gray-700">{formatDate(activity.date)}</p>
                        <p className="font-mono text-xs text-gray-500">{activity.reference || '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        <p>{activity.type}</p>
                        <p className="max-w-xs truncate text-xs text-gray-500" title={activity.description}>{activity.description || '—'}</p>
                      </td>
                      <td className={`px-3 py-2 text-xs font-medium ${activity.statusTone}`}>{activity.status}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${activity.amount < 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                        {formatMoney(activity.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">No recent cash transactions.</p>}
        </section>
      </div>
    </div>
  );
};

const MemberAccounts = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [memberSort, setMemberSort] = useState('newest');
  const [showMemberSortFilter, setShowMemberSortFilter] = useState(false);
  const [members, setMembers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadMembers = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      let query = supabase.from('members').select(`
        id, member_number, first_name, middle_name, last_name, phone, membership_status,
        savings_accounts(id, account_number, account_type, balance, interest_rate, status, opening_date, maturity_date, closing_date),
        loans(id, loan_number, principal_amount, balance, status, maturity_date, release_date)
      `, { count: 'exact' });
      const term = searchTerm.trim().replace(/[,%()_*]/g, '');

      if (term) {
        const escaped = term.replaceAll('.', '\\.');
        query = query.or(
          `first_name.ilike.%${escaped}%,middle_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,member_number.ilike.%${escaped}%`
        );
      }

      if (memberSort === 'newest' || memberSort === 'oldest') {
        query = query.order('date_joined', {
          ascending: memberSort === 'oldest',
          nullsFirst: false
        });
        query = query.order('member_number', { ascending: false });
      } else if (memberSort === 'id-asc' || memberSort === 'id-desc') {
        query = query.order('member_number', { ascending: memberSort === 'id-asc' });
      } else {
        const ascending = memberSort === 'name-asc';
        query = query
          .order('last_name', { ascending })
          .order('first_name', { ascending })
          .order('middle_name', { ascending })
          .order('member_number', { ascending: true });
      }

      const { data, count, error: queryError } = await query
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (queryError) throw queryError;

      if (currentRequest !== requestId.current) return;
      setMembers(data || []);
      setTotalCount(count || 0);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load treasurer member accounts:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'member accounts'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [memberSort, page, searchTerm]);

  useEffect(() => {
    loadMembers();
    return () => {
      requestId.current += 1;
    };
  }, [loadMembers]);

  useMultipleRealtimeSubscriptions([
    'members', 'savings_accounts', 'loans', 'loan_schedule', 'savings_transactions',
    'loan_payments', 'cash_receipts', 'cash_disbursements', 'transaction_workflows',
    'transaction_workflow_events'
  ].map((table) => ({ table, onUpdate: loadMembers })), [loadMembers]);

  const handleSearch = (event) => {
    setLoading(true);
    setPage(0);
    setSearchTerm(event.target.value);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Member Accounts</h2>
          <button
            type="button"
            aria-expanded={showMemberSortFilter}
            aria-controls="treasurer-member-sort-filter"
            onClick={() => setShowMemberSortFilter((open) => !open)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <Filter size={16} aria-hidden="true" />
            Filter / Sort
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <label className="relative block max-w-xl">
            <span className="sr-only">Search members</span>
            <Search size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search by member name or number"
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          {showMemberSortFilter && (
            <div id="treasurer-member-sort-filter" className="rounded-lg border border-gray-100 bg-slate-50 p-3">
              <MemberReportSort
                value={memberSort}
                onChange={(value) => {
                  setLoading(true);
                  setPage(0);
                  setMemberSort(value);
                }}
                id="treasurer-directory-sort"
              />
            </div>
          )}
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Members matching search</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : totalCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Members on this page</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : members.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Page</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : `${page + 1} of ${totalPages}`}</p>
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500 shadow-sm">
            Loading member accounts…
          </div>
        ) : !error && members.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500 shadow-sm">
            {searchTerm ? 'No members match this search.' : 'No member records found.'}
          </div>
        ) : !error ? members.map((member) => {
          const accounts = member.savings_accounts || [];
          const activeAccounts = accounts.filter((account) => account.status === 'active');
          const savingsBalance = activeAccounts
            .filter((account) => account.account_type !== 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0);
          const timeDepositBalance = activeAccounts
            .filter((account) => account.account_type === 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0);
          const activeLoans = (member.loans || []).filter((loan) => loan.status === 'active');
          const loanBalance = activeLoans.reduce((total, loan) => total + Number(loan.balance || 0), 0);
          const expanded = expandedMemberId === member.id;

          return (
            <article key={member.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(140px,1fr))_auto] lg:items-center">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">{getMemberName(member)}</h3>
                  <p className="mt-1 text-sm text-gray-500">Member no. {member.member_number}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    member.membership_status === 'active'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {member.membership_status || 'Unknown status'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Savings</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(savingsBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeAccounts.filter((account) => account.account_type !== 'time_deposit').length} active accounts</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Time deposits</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(timeDepositBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeAccounts.filter((account) => account.account_type === 'time_deposit').length} active accounts</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active loans</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(loanBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeLoans.length} active loans</p>
                </div>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedMemberId(expanded ? null : member.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {expanded ? 'Hide details' : 'View details'}
                  {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                </button>
              </div>

              {expanded && (
                <MemberAccountDetails member={member} accounts={accounts} loans={member.loans || []} />
              )}
            </article>
          );
        }) : null}
      </section>

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <p className="text-sm text-gray-500">
          {totalCount ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}` : 'No results'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => Math.max(0, current - 1));
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => current + 1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberAccounts;

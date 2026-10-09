import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';

const categories = [
  { key: 'loan', label: 'Loan Requests', filterLabel: 'Loan Requests', accent: 'text-slate-800', badge: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { key: 'savings', label: 'Savings', filterLabel: 'Savings', accent: 'text-slate-800', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { key: 'withdrawal', label: 'Withdrawals', filterLabel: 'Withdrawals', accent: 'text-slate-800', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { key: 'time_deposit', label: 'Time Deposits', filterLabel: 'Time Deposits', accent: 'text-slate-800', badge: 'bg-indigo-50 text-indigo-800 ring-indigo-200' }
];

const categoryByKey = Object.fromEntries(categories.map((category) => [category.key, category]));

const getCategory = (request) => {
  const type = String(request.request_data?.type || '').toLowerCase();
  if (request.request_type === 'withdrawal' || type.includes('withdraw')) return 'withdrawal';
  if (type.includes('time deposit')) return 'time_deposit';
  if (type.includes('savings')) return 'savings';
  if (request.request_type === 'loan_application' || request.request_type === 'loan_release' || type.startsWith('loan')) return 'loan';
  return null;
};

const formatAmount = (amount) => {
  const numericAmount = Number(amount);
  return `₱${(Number.isFinite(numericAmount) ? numericAmount : 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
};

const statusStyles = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  under_review: 'bg-sky-50 text-sky-800 ring-sky-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 ring-rose-200'
};

const formatStatus = (status) => String(status || '').replaceAll('_', ' ').replace(/^\w/, (char) => char.toUpperCase());

const RequestManagement = () => {
  const { staff } = useAuth();
  const [filter, setFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const closeModals = () => {
    setShowFinalConfirm(false);
    setShowApprovalModal(false);
  };

  const fetchRequests = useCallback(async () => {
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('requests')
        .select('id, request_number, request_type, request_data, amount, status, created_at, member:members(member_number, first_name, middle_name, last_name)')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setRequests((data || []).flatMap((request) => {
        const category = getCategory(request);
        if (!category) return [];

        const requestData = request.request_data || {};
        const member = Array.isArray(request.member) ? request.member[0] : request.member;
        const memberName = [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ');

        return [{
          id: request.request_number,
          recordId: request.id,
          category,
          member: memberName || 'Member',
          memberId: member?.member_number || '—',
          amount: Number(request.amount) || 0,
          date: new Date(request.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
          status: request.status,
          details: requestData.purpose || 'No additional details provided',
          loanType: requestData.loan_type,
          requestData
        }];
      }));
    } catch (fetchError) {
      console.error('Unable to load manager requests:', fetchError);
      setError('Requests could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useRealtimeSubscription('requests', fetchRequests, null, [fetchRequests]);

  const handleApprove = (request) => {
    setSelectedRequest(request);
    setApprovalAction('approve');
    setShowApprovalModal(true);
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setApprovalAction('reject');
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const confirmAction = async () => {
    if (approvalAction === 'reject' && !rejectionReason.trim()) return;

    setProcessing(true);
    setError('');
    const reviewedAt = new Date().toISOString();
    const update = {
      status: approvalAction === 'approve' ? 'approved' : 'rejected',
      reviewed_by: staff?.id,
      reviewed_at: reviewedAt,
      review_notes: approvalAction === 'reject' ? rejectionReason.trim() : null
    };

    if (approvalAction === 'approve') {
      update.approved_by = staff?.id;
      update.approved_at = reviewedAt;
      update.approval_notes = 'Approved by manager';
    }

    try {
      const { error: updateError } = await supabase
        .from('requests')
        .update(update)
        .eq('id', selectedRequest.recordId);

      if (updateError) throw updateError;
      closeModals();
      setSelectedRequest(null);
      await fetchRequests();
    } catch (updateError) {
      console.error('Unable to update request status:', updateError);
      setError('The request status could not be updated. Please try again.');
      closeModals();
    } finally {
      setProcessing(false);
    }
  };

  const countFor = (key) => requests.filter((request) => request.category === key).length;
  const pendingCount = requests.filter((request) => ['pending', 'under_review'].includes(request.status)).length;
  const rejectedCount = requests.filter((request) => request.status === 'rejected').length;
  const filteredRequests = filter === 'all'
    ? requests
    : requests.filter((request) => request.category === filter);

  const filterButton = (key, label, count) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
        filter === key
          ? 'bg-slate-800 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label} <span className={filter === key ? 'text-slate-300' : 'text-slate-500'}>({count})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Awaiting Review</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{pendingCount}</p>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Rejected</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{rejectedCount}</p>
        </section>
        {categories.map((category) => (
          <section key={category.key} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{category.label}</p>
            <p className={`mt-1 text-3xl font-semibold ${category.accent}`}>{countFor(category.key)}</p>
          </section>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-slate-600">Show:</span>
          {filterButton('all', 'All Requests', requests.length)}
          {categories.map((category) => filterButton(category.key, category.filterLabel, countFor(category.key)))}
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No requests found.</div>
        ) : filteredRequests.map((request) => (
          <article key={request.recordId} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${categoryByKey[request.category].badge}`}>
                    {categoryByKey[request.category].label}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[request.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                    {formatStatus(request.status)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{request.id}</h3>
                <p className="mt-1 text-sm text-slate-500">Submitted {request.date}</p>
              </div>
              {['pending', 'under_review'].includes(request.status) && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(request)}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(request)}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Member name</p>
                <p className="text-sm font-medium text-slate-900">{request.member}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Member ID</p>
                <p className="text-sm font-medium text-slate-900">{request.memberId}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Amount</p>
                <p className="text-sm font-semibold text-slate-900">{formatAmount(request.amount)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Request details</p>
              <p>{request.details}</p>
              {request.loanType && <p className="text-slate-600"><span className="font-medium">Loan type:</span> {request.loanType}</p>}
              {request.requestData.preferred_date && <p className="text-slate-600"><span className="font-medium">Preferred date:</span> {request.requestData.preferred_date}</p>}
            </div>
          </article>
        ))}
      </div>

      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
            <div className="shrink-0 border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {approvalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
              </h3>
            </div>

            <dl className="space-y-3 overflow-y-auto px-6 py-5">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Request ID</dt>
                <dd className="text-sm font-medium text-slate-900">{selectedRequest.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Member</dt>
                <dd className="text-sm font-medium text-slate-900">{selectedRequest.member}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</dt>
                <dd className="text-sm font-semibold text-slate-900">{formatAmount(selectedRequest.amount)}</dd>
              </div>

              {approvalAction === 'reject' && (
                <div className="pt-2">
                  <label htmlFor="rejection-reason" className="mb-2 block text-sm font-medium text-slate-700">
                    Reason for rejection
                  </label>
                  <textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Provide a clear reason for rejection"
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                  />
                  {!rejectionReason.trim() && <p className="mt-1 text-xs text-slate-500">A reason is required to reject a request.</p>}
                </div>
              )}

              {approvalAction === 'approve' && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  After approval, the Treasurer will handle the financial transaction and the member will be notified.
                </p>
              )}
            </dl>

            <div className="flex shrink-0 gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowFinalConfirm(true)}
                disabled={processing || (approvalAction === 'reject' && !rejectionReason.trim())}
                style={{ backgroundColor: approvalAction === 'approve' ? '#047857' : '#b91c1c' }}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && showFinalConfirm && selectedRequest && (
        <div style={{ zIndex: 60 }} className="fixed inset-0 flex items-center justify-center bg-slate-900/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="final-confirm-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 id="final-confirm-title" className="text-lg font-semibold text-slate-900">
              {approvalAction === 'approve' ? 'Approve this request?' : 'Reject this request?'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              You are about to {approvalAction === 'approve' ? 'approve' : 'reject'} {selectedRequest.member}'s request for {formatAmount(selectedRequest.amount)}. The member's request status will be updated right away.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowFinalConfirm(false)}
                disabled={processing}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={processing}
                style={{ backgroundColor: approvalAction === 'approve' ? '#047857' : '#b91c1c' }}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing ? 'Saving...' : 'Yes, Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestManagement;

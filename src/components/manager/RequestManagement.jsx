import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';

const requestTypeLabels = {
  loan_application: 'Loan Application',
  withdrawal: 'Withdrawal',
  loan_release: 'Loan Release',
  membership: 'Membership',
  other: 'Other Request'
};

const formatAmount = (amount) => {
  const numericAmount = Number(amount);
  return `₱${(Number.isFinite(numericAmount) ? numericAmount : 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
};

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

  const fetchRequests = useCallback(async () => {
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('requests')
        .select('id, request_number, request_type, request_data, amount, status, created_at, member:members(member_number, first_name, middle_name, last_name)')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setRequests((data || []).map((request) => {
        const requestData = request.request_data || {};
        const member = Array.isArray(request.member) ? request.member[0] : request.member;
        const memberName = [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ');
        const type = requestData.type || requestTypeLabels[request.request_type] || 'Other Request';

        return {
          id: request.request_number,
          recordId: request.id,
          type,
          filterKey: type.toLowerCase().replace(/\s+/g, '_'),
          member: memberName || 'Member',
          memberId: member?.member_number || '—',
          amount: Number(request.amount) || 0,
          date: new Date(request.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
          status: request.status,
          details: requestData.purpose || 'No additional details provided',
          loanType: requestData.loan_type,
          requestData
        };
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
      setShowApprovalModal(false);
      setSelectedRequest(null);
      await fetchRequests();
    } catch (updateError) {
      console.error('Unable to update request status:', updateError);
      setError('The request status could not be updated. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const getRequestTypeColor = (type) => {
    const colors = {
      'Loan': 'bg-blue-100 text-blue-800',
      'Loan Application': 'bg-blue-100 text-blue-800',
      'Withdrawal': 'bg-green-100 text-green-800',
      'Savings Deposit': 'bg-green-100 text-green-800',
      'Time Deposit': 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'under_review': 'bg-blue-100 text-blue-800 border-blue-200',
      'approved': 'bg-green-100 text-green-800 border-green-200',
      'rejected': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredRequests = filter === 'all'
    ? requests
    : requests.filter((request) => request.filterKey === filter);
  const loanRequests = requests.filter((request) => request.filterKey === 'loan_application' || request.type === 'Loan');
  const withdrawalRequests = requests.filter((request) => request.type === 'Withdrawal');
  const timeDepositRequests = requests.filter((request) => request.type === 'Time Deposit');

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Requests</p>
              <p className="text-3xl font-bold text-gray-900">{requests.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📋</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Loan Requests</p>
              <p className="text-3xl font-bold text-blue-600">
                {loanRequests.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Savings Deposits</p>
              <p className="text-3xl font-bold text-green-600">{requests.filter((request) => request.type === 'Savings Deposit').length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💵</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Withdrawals</p>
              <p className="text-3xl font-bold text-green-600">
                {requests.filter(r => r.type === 'Withdrawal').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💵</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Time Deposits</p>
              <p className="text-3xl font-bold text-purple-600">
                {requests.filter(r => r.type === 'Time Deposit').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💎</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Filter by type:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Requests
          </button>
          <button
            onClick={() => setFilter('loan_application')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'loan_application' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Loan Applications
          </button>
          <button
            onClick={() => setFilter('savings_deposit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'savings_deposit'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Savings Deposits
          </button>
          <button
            onClick={() => setFilter('withdrawal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'withdrawal' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Withdrawals
          </button>
          <button
            onClick={() => setFilter('time_deposit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'time_deposit' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Time Deposits
          </button>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No requests match this filter.</div>
        ) : filteredRequests.map((request) => (
          <div key={request.id} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRequestTypeColor(request.type)}`}>
                    {request.type}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(request.status)}`}>
                    {request.status.replaceAll('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{request.id}</h3>
                <p className="text-sm text-gray-600 mt-1">Submitted: {request.date}</p>
              </div>
              {['pending', 'under_review'].includes(request.status) && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleApprove(request)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(request)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Member Name</p>
                <p className="text-sm font-semibold text-gray-900">{request.member}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Member ID</p>
                <p className="text-sm font-semibold text-gray-900">{request.memberId}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Amount</p>
                <p className="text-sm font-semibold text-blue-600">{formatAmount(request.amount)}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">Request Details</p>
              <p className="text-sm text-gray-700">{request.details}</p>
              {request.loanType && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">Loan Type:</span> {request.loanType}
                </p>
              )}
              {request.requestData.preferred_date && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">Preferred Date:</span> {request.requestData.preferred_date}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Approval/Rejection Modal */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {approvalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
              </h3>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600">Request ID:</p>
                <p className="text-lg font-semibold text-gray-900">{selectedRequest.id}</p>
              </div>
              <div className="mb-4">
                <p className="text-sm text-gray-600">Member:</p>
                <p className="text-lg font-semibold text-gray-900">{selectedRequest.member}</p>
              </div>
              <div className="mb-4">
                <p className="text-sm text-gray-600">Amount:</p>
                <p className="text-lg font-semibold text-blue-600">{formatAmount(selectedRequest.amount)}</p>
              </div>

              {approvalAction === 'reject' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Rejection *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please provide a clear reason for rejection..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {!rejectionReason.trim() && <p className="mt-1 text-xs text-gray-500">A reason is required to reject a request.</p>}
                </div>
              )}

              {approvalAction === 'approve' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <p className="text-sm text-blue-900">
                    ℹ️ After approval, the Treasurer will handle the financial transaction. The member will be notified of the approval.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={processing || (approvalAction === 'reject' && !rejectionReason.trim())}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium ${
                  approvalAction === 'approve' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {processing ? 'Saving...' : approvalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestManagement;

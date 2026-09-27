import React, { useState } from 'react';

const RequestManagement = () => {
  const [filter, setFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [requests] = useState([
    {
      id: 'LR-2026-00321',
      type: 'Loan',
      member: 'Juan Dela Cruz',
      memberId: '12345',
      amount: 50000,
      date: '2026-06-01',
      status: 'pending',
      details: 'Loan for small business expansion',
      loanHistory: 'Good - 3 previous loans, all paid on time',
      savingsBalance: 25000
    },
    {
      id: 'WR-2026-00089',
      type: 'Withdrawal',
      member: 'Maria Santos',
      memberId: '12367',
      amount: 15000,
      date: '2026-06-02',
      status: 'pending',
      details: 'Emergency withdrawal for medical expenses',
      savingsBalance: 45000
    },
    {
      id: 'TD-2026-00045',
      type: 'Time Deposit',
      member: 'Pedro Reyes',
      memberId: '12389',
      amount: 30000,
      date: '2026-06-03',
      status: 'pending',
      details: '12-month time deposit',
      term: '12 months',
      savingsBalance: 60000
    }
  ]);

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

  const confirmAction = () => {
    if (approvalAction === 'approve') {
      alert(`Request ${selectedRequest.id} has been approved. The Treasurer will handle the financial transaction.`);
    } else {
      if (!rejectionReason.trim()) {
        alert('Please provide a reason for rejection');
        return;
      }
      alert(`Request ${selectedRequest.id} has been rejected. Member will be notified.`);
    }
    setShowApprovalModal(false);
    setSelectedRequest(null);
  };

  const getRequestTypeColor = (type) => {
    const colors = {
      'Loan': 'bg-blue-100 text-blue-800',
      'Withdrawal': 'bg-green-100 text-green-800',
      'Time Deposit': 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'approved': 'bg-green-100 text-green-800 border-green-200',
      'rejected': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(r => r.type.toLowerCase() === filter);

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                {requests.filter(r => r.type === 'Loan').length}
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
        <div className="flex items-center space-x-3">
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
            onClick={() => setFilter('loan')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'loan' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Loans
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
            onClick={() => setFilter('time deposit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'time deposit' 
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
        {filteredRequests.map((request) => (
          <div key={request.id} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRequestTypeColor(request.type)}`}>
                    {request.type}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(request.status)}`}>
                    {request.status.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{request.id}</h3>
                <p className="text-sm text-gray-600 mt-1">Submitted: {request.date}</p>
              </div>
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
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
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
                <p className="text-sm font-semibold text-blue-600">₱{request.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Savings Balance</p>
                <p className="text-sm font-semibold text-green-600">₱{request.savingsBalance.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">Request Details</p>
              <p className="text-sm text-gray-700">{request.details}</p>
              {request.loanHistory && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">Loan History:</span> {request.loanHistory}
                </p>
              )}
              {request.term && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">Term:</span> {request.term}
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
                <p className="text-lg font-semibold text-blue-600">₱{selectedRequest.amount.toLocaleString()}</p>
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
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium ${
                  approvalAction === 'approve' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {approvalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestManagement;

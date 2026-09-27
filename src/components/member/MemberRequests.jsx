import React, { useState } from 'react';
import EmptyState from '../common/EmptyState';
import InfoIcon from '../common/InfoIcon';

const MemberRequests = () => {
  const [activeTab, setActiveTab] = useState('submit');
  const [requestType, setRequestType] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);

  const requests = [
    { id: 1, type: 'Loan Application', date: 'May 29, 2026', amount: '₱50,000', status: 'Pending', color: 'yellow' },
    { id: 2, type: 'Savings Deposit', date: 'May 27, 2026', amount: '₱5,000', status: 'Approved', color: 'green' },
    { id: 3, type: 'Time Deposit', date: 'May 15, 2026', amount: '₱50,000', status: 'Completed', color: 'blue' }
  ];

  const getStatusColor = (color) => {
    const colors = {
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[color];
  };

  const handleRequestClick = (type) => {
    setRequestType(type);
    setShowRequestModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('submit')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'submit'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Submit New Request
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Request History
            </button>
          </div>
        </div>

        {/* Submit New Request Tab */}
        {activeTab === 'submit' && (
          <div className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Choose Request Type</h3>
              <InfoIcon text="Select a request type to submit. After approval, visit the office to complete the transaction." position="right" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => handleRequestClick('Savings Deposit')}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Savings Deposit</h4>
                <p className="text-sm text-gray-600">Request to deposit to your savings account</p>
              </button>

              <button
                onClick={() => handleRequestClick('Time Deposit')}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Time Deposit</h4>
                <p className="text-sm text-gray-600">Open a new time deposit account</p>
              </button>

              <button
                onClick={() => handleRequestClick('Loan Application')}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Loan Application</h4>
                <p className="text-sm text-gray-600">Apply for a new loan</p>
              </button>
            </div>
          </div>
        )}

        {/* Request History Tab */}
        {activeTab === 'history' && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request History</h3>
            {requests.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                title="No Requests Yet"
                description="You haven't submitted any requests yet. Use the 'Submit New Request' tab to create your first request for savings, time deposits, or loans."
                actionLabel="Submit Request"
                onAction={() => setActiveTab('submit')}
              />
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-semibold text-gray-900">{request.type}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.color)}`}>
                            {request.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          <span>Submitted: {request.date}</span>
                          <span className="mx-2">•</span>
                          <span>Amount: {request.amount}</span>
                        </div>
                      </div>
                      <button className="px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Information Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">Request Processing</p>
            <p className="text-sm text-blue-700 mt-1">
              Once your request is approved, please visit the cooperative office to complete the financial transaction. The website is for request submission only - no online payments are processed.
            </p>
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">{requestType}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                  <input
                    type="number"
                    placeholder="Enter amount"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                {requestType === 'Loan Application' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Loan Type</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <option>Agricultural Loan</option>
                        <option>Business Loan</option>
                        <option>Emergency Loan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Purpose</label>
                      <textarea
                        rows={3}
                        placeholder="Describe the purpose of the loan"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      ></textarea>
                    </div>
                  </>
                )}
                {requestType === 'Savings Deposit' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
              </div>
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberRequests;

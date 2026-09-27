import React, { useState } from 'react';
import { getRecordBadgeClasses, getRoleDotClasses } from '../../utils/portalColors';

const MemberAccounts = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);

  const members = [
    {
      id: '12345',
      name: 'Juan Dela Cruz',
      status: 'Active',
      savings: 25430,
      loan: { amount: 50000, paid: 12500, balance: 37500, nextDue: '2026-06-10' },
      timeDeposit: { amount: 30000, placed: '2025-12-01', maturity: '2026-12-01', interest: 5 },
      recentTransactions: [
        { date: '2026-06-03', type: 'Loan Payment', amount: 2500, ref: 'LP-2026-00231', recordedBy: 'TREASURER' },
        { date: '2026-05-28', type: 'Savings Deposit', amount: 3000, ref: 'SD-2026-00445', recordedBy: 'TREASURER' }
      ]
    },
    {
      id: '12367',
      name: 'Maria Santos',
      status: 'Active',
      savings: 45000,
      loan: null,
      timeDeposit: { amount: 50000, placed: '2026-01-15', maturity: '2027-01-15', interest: 5 },
      recentTransactions: [
        { date: '2026-06-01', type: 'Savings Deposit', amount: 5000, ref: 'SD-2026-00442', recordedBy: 'BOOKKEEPER' }
      ]
    }
  ];

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">Search Member</label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter member name or ID..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Members List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredMembers.map((member) => (
          <div key={member.id} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{member.name}</h3>
                <p className="text-sm text-gray-600">Member ID: {member.id}</p>
                <span className="inline-block mt-2 bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                  {member.status}
                </span>
              </div>
              <button
                onClick={() => setSelectedMember(member)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
              >
                View Full Details
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 mb-1">Savings Balance</p>
                <p className="text-lg font-bold text-green-600">₱{member.savings.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Loan Balance</p>
                <p className="text-lg font-bold text-blue-600">
                  {member.loan ? `₱${member.loan.balance.toLocaleString()}` : 'No Active Loan'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Time Deposit</p>
                <p className="text-lg font-bold text-purple-600">
                  {member.timeDeposit ? `₱${member.timeDeposit.amount.toLocaleString()}` : 'None'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Member Details Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedMember.name}</h3>
                  <p className="text-sm text-gray-600">Member ID: {selectedMember.id}</p>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Savings */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Savings Account</h4>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current Balance</p>
                  <p className="text-3xl font-bold text-green-600">₱{selectedMember.savings.toLocaleString()}</p>
                </div>
              </div>

              {/* Loan */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Loan Information</h4>
                {selectedMember.loan ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Original Amount</p>
                        <p className="text-lg font-semibold text-gray-900">₱{selectedMember.loan.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Amount Paid</p>
                        <p className="text-lg font-semibold text-green-600">₱{selectedMember.loan.paid.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Remaining Balance</p>
                        <p className="text-lg font-semibold text-blue-600">₱{selectedMember.loan.balance.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Next Payment Due</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedMember.loan.nextDue}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">No active loan</p>
                )}
              </div>

              {/* Time Deposit */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Time Deposit</h4>
                {selectedMember.timeDeposit ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Deposit Amount</p>
                        <p className="text-lg font-semibold text-purple-600">₱{selectedMember.timeDeposit.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Interest Rate</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedMember.timeDeposit.interest}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Date Placed</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedMember.timeDeposit.placed}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Maturity Date</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedMember.timeDeposit.maturity}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">No time deposit</p>
                )}
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Recent Transactions</h4>
                <div className="space-y-2">
                  {selectedMember.recentTransactions.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{t.type}</p>
                        <p className="text-xs text-gray-500">{t.date} • Ref: {t.ref}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getRecordBadgeClasses(t.recordedBy)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getRoleDotClasses(t.recordedBy)}`}></span>
                          <span>{t.recordedBy}</span>
                        </span>
                        <p className="text-sm font-bold text-gray-900">₱{t.amount.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setSelectedMember(null)}
                className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberAccounts;

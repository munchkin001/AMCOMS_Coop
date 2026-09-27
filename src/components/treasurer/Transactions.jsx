import React, { useState } from 'react';

const Transactions = () => {
  const [transactionType, setTransactionType] = useState('money-received');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [formData, setFormData] = useState({
    memberName: '',
    type: 'loan-payment',
    amount: '',
    remarks: ''
  });

  const handleRecord = () => {
    if (!formData.memberName || !formData.amount) {
      alert('Please fill in required fields');
      return;
    }
    
    const refNumber = `${formData.type.split('-')[0].toUpperCase()}-2026-${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`;
    alert(`Transaction recorded successfully!\nReference Number: ${refNumber}\nMember account has been updated.`);
    
    setFormData({
      memberName: '',
      type: 'loan-payment',
      amount: '',
      remarks: ''
    });
    setShowRecordModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600">Record and manage financial transactions</p>
        </div>
        <button
          onClick={() => setShowRecordModal(true)}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Record Transaction</span>
        </button>
      </div>

      {/* Transaction Type Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTransactionType('money-received')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              transactionType === 'money-received'
                ? 'text-teal-600 border-b-2 border-teal-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Money Received
          </button>
          <button
            onClick={() => setTransactionType('money-released')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              transactionType === 'money-released'
                ? 'text-teal-600 border-b-2 border-teal-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Money Released
          </button>
        </div>
      </div>

      {/* Money Received */}
      {transactionType === 'money-received' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: 'Loan Payment', icon: '💰', desc: 'Record member loan payment', color: 'blue', type: 'loan-payment' },
              { name: 'Savings Deposit', icon: '🏦', desc: 'Record savings deposit', color: 'green', type: 'savings-deposit' },
              { name: 'Time Deposit Placement', icon: '💎', desc: 'Record time deposit placement', color: 'purple', type: 'time-deposit' },
              { name: 'Other Collections', icon: '💵', desc: 'Record other cooperative collections', color: 'cyan', type: 'other-collection' }
            ].map((type, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  setFormData({ ...formData, type: type.type });
                  setShowRecordModal(true);
                }}
                className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-4xl">{type.icon}</span>
                  <div>
                    <h4 className="font-semibold text-gray-900">{type.name}</h4>
                    <p className="text-sm text-gray-600">{type.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Money Released */}
      {transactionType === 'money-released' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: 'Savings Withdrawal', icon: '📤', desc: 'Process savings withdrawal', color: 'orange', type: 'savings-withdrawal' },
              { name: 'Time Deposit Withdrawal', icon: '💎', desc: 'Process time deposit withdrawal/maturity', color: 'purple', type: 'time-deposit-withdrawal' },
              { name: 'Loan Release', icon: '💸', desc: 'Release approved loan amount', color: 'red', type: 'loan-release' }
            ].map((type, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  setFormData({ ...formData, type: type.type });
                  setShowRecordModal(true);
                }}
                className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-4xl">{type.icon}</span>
                  <div>
                    <h4 className="font-semibold text-gray-900">{type.name}</h4>
                    <p className="text-sm text-gray-600">{type.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record Transaction Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Record Transaction</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <optgroup label="Money Received">
                    <option value="loan-payment">Loan Payment</option>
                    <option value="savings-deposit">Savings Deposit</option>
                    <option value="time-deposit">Time Deposit Placement</option>
                    <option value="other-collection">Other Collections</option>
                  </optgroup>
                  <optgroup label="Money Released">
                    <option value="savings-withdrawal">Savings Withdrawal</option>
                    <option value="time-deposit-withdrawal">Time Deposit Withdrawal</option>
                    <option value="loan-release">Loan Release</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Member Name *</label>
                <input
                  type="text"
                  value={formData.memberName}
                  onChange={(e) => setFormData({ ...formData, memberName: e.target.value })}
                  placeholder="Search member..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Remarks (Optional)</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
              <button
                onClick={() => setShowRecordModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRecord}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                Record Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;

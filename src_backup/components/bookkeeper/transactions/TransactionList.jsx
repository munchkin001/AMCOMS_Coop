import React, { useState } from 'react';

const TransactionList = ({ onNewTransaction, onViewTransaction }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Sample transaction data
  const transactions = [
    { 
      id: 1, 
      date: 'May 29, 2026', 
      referenceNo: 'OR-000123', 
      particulars: 'Loan Payment – Juan Andoy', 
      type: 'Receipt', 
      amount: 5556.00, 
      status: 'Recorded' 
    },
    { 
      id: 2, 
      date: 'May 29, 2026', 
      referenceNo: 'OR-000124', 
      particulars: 'Sales – Maria Santos', 
      type: 'Receipt', 
      amount: 1840.00, 
      status: 'Recorded' 
    },
    { 
      id: 3, 
      date: 'May 30, 2026', 
      referenceNo: 'CD-000041', 
      particulars: 'Office Supplies', 
      type: 'Disbursement', 
      amount: 2500.00, 
      status: 'For Review' 
    },
    { 
      id: 4, 
      date: 'May 30, 2026', 
      referenceNo: 'OR-000125', 
      particulars: 'Membership Fee – Pedro Reyes', 
      type: 'Receipt', 
      amount: 100.00, 
      status: 'Draft' 
    },
    { 
      id: 5, 
      date: 'May 30, 2026', 
      referenceNo: 'OR-000126', 
      particulars: 'Time Deposit – Ana Garcia', 
      type: 'Receipt', 
      amount: 10000.00, 
      status: 'Recorded' 
    },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-700';
      case 'Recorded':
        return 'bg-green-100 text-green-700';
      case 'For Review':
        return 'bg-yellow-100 text-yellow-700';
      case 'Reviewed':
        return 'bg-blue-100 text-blue-700';
      case 'Voided':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = txn.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         txn.particulars.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || txn.type === filterType;
    const matchesStatus = filterStatus === 'all' || txn.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Today's Transactions</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900">18</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Total Receipts</p>
          <p className="text-2xl lg:text-3xl font-bold text-green-600">₱45,250</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Total Disbursements</p>
          <p className="text-2xl lg:text-3xl font-bold text-red-600">₱21,500</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">For Review</p>
          <p className="text-2xl lg:text-3xl font-bold text-yellow-600">4</p>
        </div>
      </div>

      {/* Actions and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Transaction List</h2>
            <p className="text-xs lg:text-sm text-gray-600 mt-1">View and manage all transactions</p>
          </div>
          <button
            onClick={onNewTransaction}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm lg:text-base flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </button>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Search transaction number, member, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm lg:text-base focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
            >
              <option value="all">All Types</option>
              <option value="Receipt">Receipt</option>
              <option value="Disbursement">Disbursement</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
            >
              <option value="all">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Recorded">Recorded</option>
              <option value="For Review">For Review</option>
              <option value="Reviewed">Reviewed</option>
            </select>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="overflow-x-auto -mx-4 lg:mx-0">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Reference No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Particulars</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((txn) => (
                  <tr 
                    key={txn.id} 
                    onClick={() => onViewTransaction(txn)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{txn.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-purple-600 whitespace-nowrap">{txn.referenceNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{txn.particulars}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{txn.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      ₱{txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-sm text-gray-600">No transactions found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionList;

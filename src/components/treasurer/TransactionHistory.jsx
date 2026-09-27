import React, { useState } from 'react';
import { getRecordBadgeClasses, getRoleDotClasses } from '../../utils/portalColors';

const TransactionHistory = () => {
  const [filters, setFilters] = useState({
    type: '',
    member: '',
    dateFrom: '',
    dateTo: ''
  });

  const transactions = [
    { date: '2026-06-03', time: '10:30 AM', ref: 'LP-2026-00231', type: 'Loan Payment', member: 'Juan Dela Cruz', amount: 2500, recordedBy: 'TREASURER' },
    { date: '2026-06-03', time: '11:15 AM', ref: 'SD-2026-00445', type: 'Savings Deposit', member: 'Maria Santos', amount: 5000, recordedBy: 'TREASURER' },
    { date: '2026-06-03', time: '01:20 PM', ref: 'SW-2026-00156', type: 'Savings Withdrawal', member: 'Pedro Reyes', amount: 3000, recordedBy: 'TREASURER' },
    { date: '2026-06-03', time: '02:45 PM', ref: 'TD-2026-00089', type: 'Time Deposit', member: 'Ana Garcia', amount: 10000, recordedBy: 'TREASURER' },
    { date: '2026-06-03', time: '03:30 PM', ref: 'SD-2026-00446', type: 'Savings Deposit', member: 'Carlos Mendoza', amount: 2000, recordedBy: 'TREASURER' },
    { date: '2026-06-02', time: '09:15 AM', ref: 'LP-2026-00228', type: 'Loan Payment', member: 'Elena Rodriguez', amount: 4500, recordedBy: 'TREASURER' },
    { date: '2026-06-02', time: '10:30 AM', ref: 'LR-2026-00045', type: 'Loan Release', member: 'Miguel Torres', amount: 50000, recordedBy: 'MANAGER' },
    { date: '2026-06-02', time: '02:20 PM', ref: 'SW-2026-00155', type: 'Savings Withdrawal', member: 'Rosa Martinez', amount: 8000, recordedBy: 'TREASURER' },
    { date: '2026-06-01', time: '11:00 AM', ref: 'LP-2026-00225', type: 'Loan Payment', member: 'Jose Sanchez', amount: 3200, recordedBy: 'TREASURER' },
    { date: '2026-06-01', time: '03:45 PM', ref: 'TD-2026-00088', type: 'Time Deposit', member: 'Linda Flores', amount: 25000, recordedBy: 'BOOKKEEPER' }
  ];

  const [filteredTransactions, setFilteredTransactions] = useState(transactions);

  const handleFilterChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const applyFilters = (currentFilters) => {
    let filtered = [...transactions];

    if (currentFilters.type) {
      filtered = filtered.filter(t => t.type === currentFilters.type);
    }

    if (currentFilters.member) {
      filtered = filtered.filter(t => 
        t.member.toLowerCase().includes(currentFilters.member.toLowerCase())
      );
    }

    if (currentFilters.dateFrom) {
      filtered = filtered.filter(t => t.date >= currentFilters.dateFrom);
    }

    if (currentFilters.dateTo) {
      filtered = filtered.filter(t => t.date <= currentFilters.dateTo);
    }

    setFilteredTransactions(filtered);
  };

  const handleReset = () => {
    setFilters({
      type: '',
      member: '',
      dateFrom: '',
      dateTo: ''
    });
    setFilteredTransactions(transactions);
  };

  const handleExport = () => {
    alert('Export functionality would generate CSV/Excel file with filtered transactions');
  };

  const getTypeColor = (type) => {
    const colors = {
      'Loan Payment': 'bg-blue-100 text-blue-800',
      'Savings Deposit': 'bg-green-100 text-green-800',
      'Savings Withdrawal': 'bg-orange-100 text-orange-800',
      'Time Deposit': 'bg-purple-100 text-purple-800',
      'Loan Release': 'bg-red-100 text-red-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Transactions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="Loan Payment">Loan Payment</option>
              <option value="Savings Deposit">Savings Deposit</option>
              <option value="Savings Withdrawal">Savings Withdrawal</option>
              <option value="Time Deposit">Time Deposit</option>
              <option value="Loan Release">Loan Release</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Member Name</label>
            <input
              type="text"
              value={filters.member}
              onChange={(e) => handleFilterChange('member', e.target.value)}
              placeholder="Search by member..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Reset Filters
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          Showing <span className="font-semibold">{filteredTransactions.length}</span> of <span className="font-semibold">{transactions.length}</span> transactions
        </p>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Date & Time</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Reference</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Member</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Recorded By</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction, idx) => (
                <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">
                    <div>{transaction.date}</div>
                    <div className="text-xs text-gray-500">{transaction.time}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 font-mono">{transaction.ref}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(transaction.type)}`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 font-medium">{transaction.member}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${getRecordBadgeClasses(transaction.recordedBy)}`}>
                      <span className={`w-2 h-2 rounded-full ${getRoleDotClasses(transaction.recordedBy)}`}></span>
                      <span>{transaction.recordedBy}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                    ₱{transaction.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Money Received</p>
          <p className="text-2xl font-bold text-green-600">
            ₱{filteredTransactions
              .filter(t => ['Loan Payment', 'Savings Deposit', 'Time Deposit'].includes(t.type))
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Money Released</p>
          <p className="text-2xl font-bold text-red-600">
            ₱{filteredTransactions
              .filter(t => ['Savings Withdrawal', 'Loan Release'].includes(t.type))
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Net Flow</p>
          <p className="text-2xl font-bold text-blue-600">
            ₱{(
              filteredTransactions
                .filter(t => ['Loan Payment', 'Savings Deposit', 'Time Deposit'].includes(t.type))
                .reduce((sum, t) => sum + t.amount, 0) -
              filteredTransactions
                .filter(t => ['Savings Withdrawal', 'Loan Release'].includes(t.type))
                .reduce((sum, t) => sum + t.amount, 0)
            ).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TransactionHistory;

import React, { useState } from 'react';

const IncomeExpenses = () => {
  const [viewType, setViewType] = useState('income');
  const [period, setPeriod] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState('2026-06');

  const incomeData = [
    { category: 'Product Sales', amount: 150000, percentage: 71.4, transactions: 45 },
    { category: 'Loan Interest', amount: 45000, percentage: 21.4, transactions: 120 },
    { category: 'Membership Fees', amount: 10000, percentage: 4.8, transactions: 8 },
    { category: 'Other Income', amount: 5000, percentage: 2.4, transactions: 3 }
  ];

  const expenseData = [
    { category: 'Utilities', amount: 20000, percentage: 40.0, transactions: 5 },
    { category: 'Transportation', amount: 12000, percentage: 24.0, transactions: 18 },
    { category: 'Office Supplies', amount: 8000, percentage: 16.0, transactions: 12 },
    { category: 'Maintenance', amount: 6000, percentage: 12.0, transactions: 4 },
    { category: 'Other Expenses', amount: 4000, percentage: 8.0, transactions: 6 }
  ];

  const totalIncome = incomeData.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenseData.reduce((sum, item) => sum + item.amount, 0);
  const netIncome = totalIncome - totalExpenses;

  const currentData = viewType === 'income' ? incomeData : expenseData;
  const currentTotal = viewType === 'income' ? totalIncome : totalExpenses;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <p className="text-sm text-gray-600 mb-2">Total Income</p>
          <p className="text-3xl font-bold text-green-600">₱{totalIncome.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-2">
            {incomeData.reduce((sum, item) => sum + item.transactions, 0)} transactions
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-sm text-gray-600 mb-2">Total Expenses</p>
          <p className="text-3xl font-bold text-red-600">₱{totalExpenses.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-2">
            {expenseData.reduce((sum, item) => sum + item.transactions, 0)} transactions
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <p className="text-sm text-gray-600 mb-2">Net Income</p>
          <p className="text-3xl font-bold text-purple-600">₱{netIncome.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-2">
            {((netIncome / totalIncome) * 100).toFixed(1)}% profit margin
          </p>
        </div>
      </div>

      {/* View Type Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setViewType('income')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              viewType === 'income'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Income Summary
          </button>
          <button
            onClick={() => setViewType('expense')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              viewType === 'expense'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Expense Summary
          </button>
        </div>

        {/* Category Breakdown */}
        <div className="p-6 space-y-4">
          {currentData.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{item.category}</p>
                  <p className="text-xs text-gray-500">{item.transactions} transactions</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    viewType === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₱{item.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">{item.percentage.toFixed(1)}% of total</p>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    viewType === 'income' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${item.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}

          {/* Total Row */}
          <div className="pt-4 mt-4 border-t-2 border-gray-300">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-lg font-bold text-gray-900">
                  Total {viewType === 'income' ? 'Income' : 'Expenses'}
                </p>
                <p className="text-sm text-gray-600">
                  {currentData.reduce((sum, item) => sum + item.transactions, 0)} total transactions
                </p>
              </div>
              <p className={`text-3xl font-bold ${
                viewType === 'income' ? 'text-green-600' : 'text-red-600'
              }`}>
                ₱{currentTotal.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Income vs Expenses Comparison</h3>
        <div className="space-y-6">
          {/* Visual Bar */}
          <div className="relative">
            <div className="flex h-12 rounded-lg overflow-hidden">
              <div
                className="bg-green-500 flex items-center justify-center text-white font-bold text-sm"
                style={{ width: `${(totalIncome / (totalIncome + totalExpenses)) * 100}%` }}
              >
                Income: ₱{(totalIncome / 1000).toFixed(0)}K
              </div>
              <div
                className="bg-red-500 flex items-center justify-center text-white font-bold text-sm"
                style={{ width: `${(totalExpenses / (totalIncome + totalExpenses)) * 100}%` }}
              >
                Expenses: ₱{(totalExpenses / 1000).toFixed(0)}K
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Income Share</p>
              <p className="text-2xl font-bold text-green-600">
                {((totalIncome / (totalIncome + totalExpenses)) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Expense Share</p>
              <p className="text-2xl font-bold text-red-600">
                {((totalExpenses / (totalIncome + totalExpenses)) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Net Income Display */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Net Income (Income - Expenses)</p>
                <p className="text-xs text-gray-500">
                  This represents the cooperative's profit for the selected period
                </p>
              </div>
              <p className="text-3xl font-bold text-purple-600">₱{netIncome.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
        <div className="flex space-x-3">
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
            Export to Excel
          </button>
          <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium">
            Print Report
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomeExpenses;

import React, { useState } from 'react';

const Reports = () => {
  const [reportType, setReportType] = useState('cash-receipts');
  const [periodFrom, setPeriodFrom] = useState('2026-04-01');
  const [periodTo, setPeriodTo] = useState('2026-04-30');

  const reportTypes = [
    { value: 'cash-receipts', label: 'Cash Receipts Report' },
    { value: 'cash-disbursement', label: 'Cash Disbursement Report' },
    { value: 'income-summary', label: 'Income Summary' },
    { value: 'expense-summary', label: 'Expense Summary' },
    { value: 'account-ledger', label: 'Account Ledger' },
    { value: 'trial-balance', label: 'Trial Balance' },
    { value: 'transaction-summary', label: 'Transaction Summary' },
    { value: 'monthly-financial', label: 'Monthly Financial Summary' }
  ];

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Report</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              {reportTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex space-x-3">
          <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
            Generate Report
          </button>
          <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium">
            Export PDF
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
            Export Excel
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Print
          </button>
        </div>
      </div>

      {/* Report Preview Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">AMCOMS</h2>
          <p className="text-gray-600">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</p>
          <h3 className="text-lg font-semibold text-purple-600 mt-4">
            {reportTypes.find(r => r.value === reportType)?.label}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {new Date(periodFrom).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-600 text-center">
            Report preview will appear here after clicking "Generate Report"
          </p>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Report Features:</strong> All reports will match the cooperative's actual accounting format and include proper headers, period information, and formatted data tables.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reports;

import React, { useState } from 'react';

const FinancialReports = () => {
  const [reportType, setReportType] = useState('financial-summary');
  const [period, setPeriod] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [showPreview, setShowPreview] = useState(false);

  const reportData = {
    period: 'June 2026',
    totalIncome: 350000,
    totalExpenses: 210000,
    netIncome: 140000,
    incomeBreakdown: [
      { category: 'Product Sales', amount: 150000 },
      { category: 'Loan Interest', amount: 45000 },
      { category: 'Membership Fees', amount: 10000 },
      { category: 'Other Income', amount: 5000 }
    ],
    expenseBreakdown: [
      { category: 'Utilities', amount: 20000 },
      { category: 'Transportation', amount: 12000 },
      { category: 'Office Supplies', amount: 8000 },
      { category: 'Maintenance', amount: 6000 },
      { category: 'Other Expenses', amount: 4000 }
    ]
  };

  const handleGenerateReport = () => {
    setShowPreview(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    alert('Report download functionality would be implemented here');
  };

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="financial-summary">Financial Summary</option>
              <option value="income-report">Income Report</option>
              <option value="expense-report">Expense Report</option>
              <option value="cash-summary">Cash Summary</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="daily">Daily</option>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <button
          onClick={handleGenerateReport}
          className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
        >
          Generate Report
        </button>
      </div>

      {/* Report Preview */}
      {showPreview && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
          {/* Report Header */}
          <div className="text-center mb-8 pb-6 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">AMCOMS</h1>
            <h2 className="text-xl font-semibold text-gray-700">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</h2>
            <div className="mt-4">
              <h3 className="text-lg font-semibold text-purple-600">
                {reportType === 'financial-summary' && 'MONTHLY FINANCIAL SUMMARY'}
                {reportType === 'income-report' && 'INCOME REPORT'}
                {reportType === 'expense-report' && 'EXPENSE REPORT'}
                {reportType === 'cash-summary' && 'CASH SUMMARY'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">{reportData.period}</p>
            </div>
          </div>

          {/* Financial Summary Report */}
          {reportType === 'financial-summary' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-lg">INCOME</h4>
                  <div className="space-y-2">
                    {reportData.incomeBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.category}</span>
                        <span className="font-semibold text-gray-900">₱{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-gray-300 flex justify-between font-bold">
                      <span>Total Income:</span>
                      <span className="text-green-600">₱{reportData.totalIncome.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-lg">EXPENSES</h4>
                  <div className="space-y-2">
                    {reportData.expenseBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.category}</span>
                        <span className="font-semibold text-gray-900">₱{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-gray-300 flex justify-between font-bold">
                      <span>Total Expenses:</span>
                      <span className="text-red-600">₱{reportData.totalExpenses.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t-2 border-gray-400">
                <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">NET INCOME:</span>
                    <span className="text-3xl font-bold text-purple-600">₱{reportData.netIncome.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 text-center text-sm text-gray-600">
                <p>Generated on {new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="mt-1">Prepared by: Bookkeeper</p>
              </div>
            </div>
          )}

          {/* Income Report */}
          {reportType === 'income-report' && (
            <div className="space-y-6">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-300">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.incomeBreakdown.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-3 px-4 text-gray-900">{item.category}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">₱{item.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {((item.amount / reportData.totalIncome) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-green-50 border-t-2 border-green-300 font-bold">
                    <td className="py-3 px-4 text-gray-900">TOTAL INCOME</td>
                    <td className="py-3 px-4 text-right text-green-600 text-lg">₱{reportData.totalIncome.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-gray-900">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Expense Report */}
          {reportType === 'expense-report' && (
            <div className="space-y-6">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-300">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.expenseBreakdown.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-3 px-4 text-gray-900">{item.category}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">₱{item.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {((item.amount / reportData.totalExpenses) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-red-50 border-t-2 border-red-300 font-bold">
                    <td className="py-3 px-4 text-gray-900">TOTAL EXPENSES</td>
                    <td className="py-3 px-4 text-right text-red-600 text-lg">₱{reportData.totalExpenses.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-gray-900">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Cash Summary */}
          {reportType === 'cash-summary' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-700 font-medium">Cash Received:</span>
                  <span className="text-lg font-bold text-green-600">₱{reportData.totalIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-700 font-medium">Cash Released:</span>
                  <span className="text-lg font-bold text-red-600">₱{reportData.totalExpenses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-4 bg-purple-50 px-4 rounded-lg border-2 border-purple-300">
                  <span className="text-gray-900 font-bold text-lg">Ending Balance:</span>
                  <span className="text-2xl font-bold text-purple-600">₱{reportData.netIncome.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handlePrint}
              className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => { setReportType('financial-summary'); setShowPreview(false); }}
          className={`p-6 rounded-lg border-2 transition-all text-left ${
            reportType === 'financial-summary'
              ? 'bg-purple-50 border-purple-500 shadow-lg'
              : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow'
          }`}
        >
          <div className="flex items-center space-x-3 mb-2">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="font-semibold text-gray-900">Financial Summary</h3>
          </div>
          <p className="text-sm text-gray-600">Complete overview of income, expenses, and net income</p>
        </button>

        <button
          onClick={() => { setReportType('income-report'); setShowPreview(false); }}
          className={`p-6 rounded-lg border-2 transition-all text-left ${
            reportType === 'income-report'
              ? 'bg-green-50 border-green-500 shadow-lg'
              : 'bg-white border-gray-200 hover:border-green-300 hover:shadow'
          }`}
        >
          <div className="flex items-center space-x-3 mb-2">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h3 className="font-semibold text-gray-900">Income Report</h3>
          </div>
          <p className="text-sm text-gray-600">Detailed breakdown of all income sources</p>
        </button>

        <button
          onClick={() => { setReportType('expense-report'); setShowPreview(false); }}
          className={`p-6 rounded-lg border-2 transition-all text-left ${
            reportType === 'expense-report'
              ? 'bg-red-50 border-red-500 shadow-lg'
              : 'bg-white border-gray-200 hover:border-red-300 hover:shadow'
          }`}
        >
          <div className="flex items-center space-x-3 mb-2">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
            <h3 className="font-semibold text-gray-900">Expense Report</h3>
          </div>
          <p className="text-sm text-gray-600">Detailed breakdown of all expenses</p>
        </button>

        <button
          onClick={() => { setReportType('cash-summary'); setShowPreview(false); }}
          className={`p-6 rounded-lg border-2 transition-all text-left ${
            reportType === 'cash-summary'
              ? 'bg-blue-50 border-blue-500 shadow-lg'
              : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow'
          }`}
        >
          <div className="flex items-center space-x-3 mb-2">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="font-semibold text-gray-900">Cash Summary</h3>
          </div>
          <p className="text-sm text-gray-600">Cash received, released, and ending balance</p>
        </button>
      </div>
    </div>
  );
};

export default FinancialReports;

import React, { useState } from 'react';

const PerformanceReport = () => {
  const [reportPeriod, setReportPeriod] = useState('2026-Q2');
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerateReport = () => {
    setShowPreview(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    alert('PDF download functionality would be implemented here');
  };

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Period
            </label>
            <select
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="2026-Q1">Q1 2026 (Jan-Mar)</option>
              <option value="2026-Q2">Q2 2026 (Apr-Jun)</option>
              <option value="2026-Q3">Q3 2026 (Jul-Sep)</option>
              <option value="2026-Q4">Q4 2026 (Oct-Dec)</option>
              <option value="2026-Full">Full Year 2026</option>
              <option value="2025-Full">Full Year 2025</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="comprehensive">Comprehensive Report</option>
              <option value="financial">Financial Summary Only</option>
              <option value="operations">Operations Summary Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comparison
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="yoy">Year-over-Year</option>
              <option value="qoq">Quarter-over-Quarter</option>
              <option value="none">No Comparison</option>
            </select>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleGenerateReport}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Generate Report
          </button>
          {showPreview && (
            <>
              <button
                onClick={handlePrint}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Print
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Download PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Report Preview */}
      {showPreview && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8" id="report-content">
          {/* Report Header */}
          <div className="text-center mb-8 pb-6 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              AMCOMS Performance Report
            </h1>
            <p className="text-lg text-gray-600">Q2 2026 (April - June 2026)</p>
            <p className="text-sm text-gray-500 mt-2">Generated: {new Date().toLocaleDateString()}</p>
          </div>

          {/* A. Financial Summary */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              A. Financial Summary
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-700">Total Income</span>
                  <span className="font-semibold text-gray-900">₱350,000.00</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-700">Total Expenses</span>
                  <span className="font-semibold text-gray-900">₱210,000.00</span>
                </div>
                <div className="flex justify-between py-2 bg-green-50 px-3 rounded">
                  <span className="text-gray-900 font-medium">Net Income</span>
                  <span className="font-bold text-green-600">₱140,000.00</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-700">Cash Received</span>
                  <span className="font-semibold text-gray-900">₱1,850,000.00</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-700">Cash Released</span>
                  <span className="font-semibold text-gray-900">₱1,720,000.00</span>
                </div>
                <div className="flex justify-between py-2 bg-blue-50 px-3 rounded">
                  <span className="text-gray-900 font-medium">Cash on Hand</span>
                  <span className="font-bold text-blue-600">₱580,000.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* B. Member Summary */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              B. Member Summary
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Total Members</span>
                  <span className="font-semibold text-gray-900">260</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Active Members</span>
                  <span className="font-semibold text-gray-900">245</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">New Members (This Quarter)</span>
                  <span className="font-semibold text-green-600">18</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Total Savings</span>
                  <span className="font-semibold text-gray-900">₱1,320,000.00</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Total Time Deposits</span>
                  <span className="font-semibold text-gray-900">₱980,000.00</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Total Share Capital</span>
                  <span className="font-semibold text-gray-900">₱650,000.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* C. Loan Summary */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              C. Loan Summary
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Active Loans</p>
                  <p className="text-2xl font-bold text-blue-600">156</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Loan Amount</p>
                  <p className="text-2xl font-bold text-green-600">₱2.45M</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Loan Payments</p>
                  <p className="text-2xl font-bold text-purple-600">₱850K</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Overdue Loans</p>
                  <p className="text-2xl font-bold text-red-600">12</p>
                </div>
              </div>
              <div className="flex justify-between py-3 px-4 bg-gray-50 rounded">
                <span className="text-gray-900 font-medium">Remaining Loan Balance</span>
                <span className="font-bold text-gray-900">₱2,450,000.00</span>
              </div>
            </div>
          </div>

          {/* D. Inventory Summary */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              D. Inventory Summary
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Total Products</span>
                  <span className="font-semibold text-gray-900">24</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Available Stock</span>
                  <span className="font-semibold text-green-600">17</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Low Stock Items</span>
                  <span className="font-semibold text-yellow-600">5</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Out-of-Stock Items</span>
                  <span className="font-semibold text-red-600">2</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Production (This Quarter)</span>
                  <span className="font-semibold text-gray-900">3,750 kg</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Products Sold</span>
                  <span className="font-semibold text-gray-900">3,200 kg</span>
                </div>
              </div>
            </div>
          </div>

          {/* E. Year-to-Year Comparison */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              E. Year-to-Year Comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900">2025</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900">2026</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900">Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">Members</td>
                    <td className="text-right py-3 px-4 text-gray-700">230</td>
                    <td className="text-right py-3 px-4 text-gray-700">260</td>
                    <td className="text-right py-3 px-4 text-green-600 font-semibold">+30 (+13%)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">Savings</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱1.1M</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱1.32M</td>
                    <td className="text-right py-3 px-4 text-green-600 font-semibold">+₱220K (+20%)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">Loans</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱2.1M</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱2.45M</td>
                    <td className="text-right py-3 px-4 text-green-600 font-semibold">+₱350K (+17%)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">Income</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱300K</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱350K</td>
                    <td className="text-right py-3 px-4 text-green-600 font-semibold">+₱50K (+17%)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">Expenses</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱190K</td>
                    <td className="text-right py-3 px-4 text-gray-700">₱210K</td>
                    <td className="text-right py-3 px-4 text-red-600 font-semibold">+₱20K (+11%)</td>
                  </tr>
                  <tr className="bg-green-50 font-semibold">
                    <td className="py-3 px-4 text-gray-900">Net Income</td>
                    <td className="text-right py-3 px-4 text-gray-900">₱110K</td>
                    <td className="text-right py-3 px-4 text-gray-900">₱140K</td>
                    <td className="text-right py-3 px-4 text-green-600">+₱30K (+27%)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary & Notes */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-3">Summary</h3>
            <p className="text-sm text-gray-700 mb-3">
              AMCOMS demonstrated strong performance in Q2 2026 with a net income of ₱140,000, 
              representing a 27% increase compared to the same period last year. Membership growth 
              continues with 18 new members this quarter, bringing total membership to 260.
            </p>
            <p className="text-sm text-gray-700">
              The cooperative's loan portfolio remains healthy with 156 active loans totaling ₱2.45M. 
              Attention is needed for the 12 overdue loans. Inventory operations are performing well 
              with 3,750 kg production this quarter.
            </p>
          </div>

          {/* Signatures */}
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="border-t-2 border-gray-300 pt-2 mt-16">
                <p className="font-semibold text-gray-900">Chairman</p>
                <p className="text-sm text-gray-600">AMCOMS</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t-2 border-gray-300 pt-2 mt-16">
                <p className="font-semibold text-gray-900">Date</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceReport;

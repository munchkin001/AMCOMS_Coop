import React, { useState } from 'react';

const Reports = () => {
  const [reportType, setReportType] = useState('financial');
  const [period, setPeriod] = useState('monthly');

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Report</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="financial">Financial Report</option>
              <option value="loan">Loan Report</option>
              <option value="member">Member Report</option>
              <option value="inventory">Inventory Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Quick Report Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { name: 'Financial Report', icon: '💵', color: 'green' },
          { name: 'Loan Report', icon: '💰', color: 'blue' },
          { name: 'Member Report', icon: '👥', color: 'purple' },
          { name: 'Inventory Report', icon: '📦', color: 'orange' }
        ].map((template, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
            <span className="text-4xl mb-3 block">{template.icon}</span>
            <h4 className="font-semibold text-gray-900 mb-2">{template.name}</h4>
            <p className="text-xs text-gray-600 mb-3">Quick access template</p>
            <div className="flex space-x-2">
              <button className="flex-1 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                View
              </button>
              <button className="flex-1 px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700">
                Print
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Reports */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Reports</h3>
        <div className="space-y-3">
          {[
            { name: 'May 2026 Financial Report', date: '2026-06-01', type: 'Financial' },
            { name: 'Q2 2026 Loan Summary', date: '2026-05-28', type: 'Loan' },
            { name: 'May 2026 Member Activity', date: '2026-05-25', type: 'Member' }
          ].map((report, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-900">{report.name}</p>
                <p className="text-xs text-gray-500">{report.date} • {report.type}</p>
              </div>
              <div className="flex space-x-2">
                <button className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                  View
                </button>
                <button className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;

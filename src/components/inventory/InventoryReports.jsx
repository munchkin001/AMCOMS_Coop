import React, { useState } from 'react';

const InventoryReports = () => {
  const [reportType, setReportType] = useState('stock-report');
  const [period, setPeriod] = useState('monthly');

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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="stock-report">Stock Report</option>
              <option value="production-report">Production Report</option>
              <option value="stock-movement">Stock Movement Report</option>
              <option value="damaged-expired">Damaged/Expired Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month/Year</label>
            <input type="month" defaultValue="2026-06" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div className="flex space-x-3">
          <button className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
            Generate Report
          </button>
          <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium">
            Print
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            Download
          </button>
        </div>
      </div>

      {/* Report Preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">AMCOMS</h2>
          <p className="text-gray-600">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</p>
          <h3 className="text-lg font-semibold text-orange-600 mt-4">
            {reportType === 'stock-report' && 'INVENTORY STOCK REPORT'}
            {reportType === 'production-report' && 'PRODUCTION REPORT'}
            {reportType === 'stock-movement' && 'STOCK MOVEMENT REPORT'}
            {reportType === 'damaged-expired' && 'DAMAGED/EXPIRED PRODUCTS REPORT'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">June 2026</p>
        </div>

        {reportType === 'stock-report' && (
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Product</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Current Stock</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Min Stock</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3 px-4">Coconut Sugar</td>
                <td className="py-3 px-4 text-right font-semibold">120 packs</td>
                <td className="py-3 px-4 text-right">30 packs</td>
                <td className="py-3 px-4 text-center"><span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Good</span></td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-4">Turmeric</td>
                <td className="py-3 px-4 text-right font-semibold">15 packs</td>
                <td className="py-3 px-4 text-right">20 packs</td>
                <td className="py-3 px-4 text-center"><span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">Low</span></td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-4">Coconut Crunch</td>
                <td className="py-3 px-4 text-right font-semibold">45 packs</td>
                <td className="py-3 px-4 text-right">25 packs</td>
                <td className="py-3 px-4 text-center"><span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Good</span></td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Generated on {new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="mt-1">Prepared by: Inventory Staff</p>
        </div>
      </div>
    </div>
  );
};

export default InventoryReports;

import React from 'react';
import { getRecordBadgeClasses, getRoleDotClasses } from '../../utils/portalColors';

const DailyCollection = () => {
  const collections = [
    { category: 'Loan Payments', amount: 82750, count: 12, icon: '💰', color: 'blue' },
    { category: 'Savings Deposits', amount: 36450, count: 8, icon: '🏦', color: 'green' },
    { category: 'Time Deposits', amount: 15600, count: 3, icon: '💎', color: 'purple' },
    { category: 'Other Collections', amount: 9650, count: 2, icon: '💵', color: 'cyan' }
  ];

  const totalCollections = collections.reduce((sum, item) => sum + item.amount, 0);
  const totalTransactions = collections.reduce((sum, item) => sum + item.count, 0);

  const recentCollections = [
    { time: '10:30 AM', type: 'Loan Payment', member: 'Juan Dela Cruz', amount: 2500, ref: 'LP-2026-00231', recordedBy: 'TREASURER' },
    { time: '11:15 AM', type: 'Savings Deposit', member: 'Maria Santos', amount: 5000, ref: 'SD-2026-00445', recordedBy: 'TREASURER' },
    { time: '01:20 PM', type: 'Loan Payment', member: 'Pedro Reyes', amount: 3000, ref: 'LP-2026-00232', recordedBy: 'TREASURER' },
    { time: '02:45 PM', type: 'Time Deposit', member: 'Ana Garcia', amount: 10000, ref: 'TD-2026-00089', recordedBy: 'TREASURER' },
    { time: '03:30 PM', type: 'Savings Deposit', member: 'Carlos Mendoza', amount: 2000, ref: 'SD-2026-00446', recordedBy: 'TREASURER' },
    { time: '04:15 PM', type: 'Loan Payment', member: 'Elena Rodriguez', amount: 4500, ref: 'LP-2026-00233', recordedBy: 'TREASURER' }
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    alert('Export to Excel functionality would be implemented here');
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-sm lg:text-base text-gray-600">Track all money collected during the day</p>
          <p className="text-xs lg:text-sm text-gray-500 mt-1">Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 lg:space-x-3">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm lg:text-base"
          >
            Print Report
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm lg:text-base"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {/* Total Summary */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg shadow p-4 lg:p-8 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
          <div>
            <p className="text-teal-100 text-xs lg:text-sm mb-2">Total Money Received Today</p>
            <p className="text-3xl lg:text-5xl font-bold">₱{totalCollections.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-teal-100 text-xs lg:text-sm mb-2">Total Transactions</p>
            <p className="text-3xl lg:text-5xl font-bold">{totalTransactions}</p>
          </div>
        </div>
      </div>

      {/* Collection Breakdown */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Collection Breakdown</h3>
        <div className="space-y-4">
          {collections.map((item, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg gap-3">
              <div className="flex items-center space-x-3 lg:space-x-4">
                <span className="text-2xl lg:text-3xl">{item.icon}</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm lg:text-base">{item.category}</p>
                  <p className="text-xs lg:text-sm text-gray-600">{item.count} transactions</p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xl lg:text-2xl font-bold text-gray-900">₱{item.amount.toLocaleString()}</p>
                <p className="text-xs lg:text-sm text-gray-500">
                  {((item.amount / totalCollections) * 100).toFixed(1)}% of total
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Total Row */}
        <div className="mt-6 pt-6 border-t-2 border-gray-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-teal-50 rounded-lg gap-3">
            <div>
              <p className="text-base lg:text-lg font-bold text-gray-900">Total Cash Received</p>
              <p className="text-xs lg:text-sm text-gray-600">{totalTransactions} total transactions</p>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-teal-600">₱{totalCollections.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Recent Collections */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 lg:p-6">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Today's Collection Details</h3>
        <div className="overflow-x-auto -mx-4 lg:mx-0">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Time</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Member</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Reference</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Recorded By</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 text-xs lg:text-sm whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentCollections.map((collection, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-3 px-4 text-xs lg:text-sm text-gray-600 whitespace-nowrap">{collection.time}</td>
                    <td className="py-3 px-4 text-xs lg:text-sm text-gray-900 font-medium whitespace-nowrap">{collection.type}</td>
                    <td className="py-3 px-4 text-xs lg:text-sm text-gray-900 whitespace-nowrap">{collection.member}</td>
                    <td className="py-3 px-4 text-xs lg:text-sm text-gray-600 whitespace-nowrap">{collection.ref}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center space-x-1 lg:space-x-2 px-2 lg:px-3 py-1 rounded-full text-xs font-medium ${getRecordBadgeClasses(collection.recordedBy)}`}>
                        <span className={`w-2 h-2 rounded-full ${getRoleDotClasses(collection.recordedBy)}`}></span>
                        <span className="whitespace-nowrap">{collection.recordedBy}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs lg:text-sm text-right font-semibold text-gray-900 whitespace-nowrap">
                      ₱{collection.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan="5" className="py-3 px-4 text-xs lg:text-sm font-bold text-gray-900">Subtotal:</td>
                  <td className="py-3 px-4 text-right font-bold text-teal-600 text-base lg:text-lg whitespace-nowrap">
                    ₱{recentCollections.reduce((sum, c) => sum + c.amount, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Cash Verification Helper */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 lg:p-6">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 lg:w-6 lg:h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="font-semibold text-yellow-900 mb-2 text-sm lg:text-base">Cash Verification</h4>
            <p className="text-xs lg:text-sm text-yellow-800 mb-3">
              Use this report to verify actual cash on hand. The total cash received today should match the physical cash count.
            </p>
            <p className="text-xs lg:text-sm font-semibold text-yellow-900">
              Expected Cash on Hand: ₱{totalCollections.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyCollection;

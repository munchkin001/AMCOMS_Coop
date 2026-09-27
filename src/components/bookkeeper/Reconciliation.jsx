import React, { useState } from 'react';

const Reconciliation = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('2026-06-03');
  const [showDetails, setShowDetails] = useState(false);

  const reconciliationData = {
    date: '2026-06-03',
    treasurerRecords: {
      cashReceived: 125450,
      cashReleased: 45300,
      netCash: 80150,
      transactions: 24
    },
    bookkeeperRecords: {
      recordedIncome: 125450,
      recordedExpenses: 45300,
      netAmount: 80150,
      entries: 24
    },
    status: 'matched' // 'matched' or 'discrepancy'
  };

  const reconciliationHistory = [
    { date: '2026-06-03', status: 'matched', difference: 0, treasurer: 125450, bookkeeper: 125450 },
    { date: '2026-06-02', status: 'matched', difference: 0, treasurer: 98750, bookkeeper: 98750 },
    { date: '2026-06-01', status: 'discrepancy', difference: 500, treasurer: 125450, bookkeeper: 124950 },
    { date: '2026-05-31', status: 'matched', difference: 0, treasurer: 87200, bookkeeper: 87200 },
    { date: '2026-05-30', status: 'matched', difference: 0, treasurer: 95600, bookkeeper: 95600 }
  ];

  const discrepancyExample = {
    date: '2026-06-01',
    treasurerRecords: {
      cashReceived: 125450,
      cashReleased: 42300,
      netCash: 83150
    },
    bookkeeperRecords: {
      recordedIncome: 124950,
      recordedExpenses: 42300,
      netAmount: 82650
    },
    difference: 500,
    status: 'discrepancy'
  };

  const isMatched = reconciliationData.status === 'matched';
  const difference = Math.abs(
    reconciliationData.treasurerRecords.netCash - reconciliationData.bookkeeperRecords.netAmount
  );

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
            <input
              type="date"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
              Run Reconciliation
            </button>
          </div>
        </div>
      </div>

      {/* Reconciliation Status */}
      <div className={`rounded-lg shadow p-6 border-2 ${
        isMatched 
          ? 'bg-green-50 border-green-300' 
          : 'bg-yellow-50 border-yellow-300'
      }`}>
        <div className="flex items-center space-x-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isMatched ? 'bg-green-100' : 'bg-yellow-100'
          }`}>
            {isMatched ? (
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <h3 className={`text-2xl font-bold ${isMatched ? 'text-green-800' : 'text-yellow-800'}`}>
              {isMatched ? '✓ Records Match' : '⚠ Discrepancy Found'}
            </h3>
            <p className={`text-sm mt-1 ${isMatched ? 'text-green-700' : 'text-yellow-700'}`}>
              {isMatched 
                ? 'Treasurer and Bookkeeper records are in agreement'
                : `Difference of ₱${difference.toLocaleString()} detected`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Record Comparison</h3>
          <p className="text-sm text-gray-600 mt-1">Date: {reconciliationData.date}</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Description</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Treasurer's Records</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Bookkeeper's Records</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-3 px-4 text-sm text-gray-900 font-medium">Cash Received / Income</td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-green-600">
                  ₱{reconciliationData.treasurerRecords.cashReceived.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-green-600">
                  ₱{reconciliationData.bookkeeperRecords.recordedIncome.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Match
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-3 px-4 text-sm text-gray-900 font-medium">Cash Released / Expenses</td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-red-600">
                  ₱{reconciliationData.treasurerRecords.cashReleased.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-red-600">
                  ₱{reconciliationData.bookkeeperRecords.recordedExpenses.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Match
                  </span>
                </td>
              </tr>
              <tr className="bg-purple-50 border-b-2 border-purple-200">
                <td className="py-3 px-4 text-sm text-gray-900 font-bold">Net Cash / Net Amount</td>
                <td className="py-3 px-4 text-sm text-right font-bold text-purple-600">
                  ₱{reconciliationData.treasurerRecords.netCash.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-sm text-right font-bold text-purple-600">
                  ₱{reconciliationData.bookkeeperRecords.netAmount.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    isMatched 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {isMatched ? '✓ Match' : '⚠ Difference'}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-sm text-gray-900 font-medium">Number of Transactions/Entries</td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                  {reconciliationData.treasurerRecords.transactions}
                </td>
                <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                  {reconciliationData.bookkeeperRecords.entries}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Match
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Example: Discrepancy Case */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Discrepancy Example</h3>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
        </div>

        {showDetails && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-900 mb-2">June 1, 2026 - Discrepancy Detected</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-yellow-800 font-medium mb-1">Treasurer: ₱125,450</p>
                      <p className="text-yellow-700">Cash received from transactions</p>
                    </div>
                    <div>
                      <p className="text-yellow-800 font-medium mb-1">Bookkeeper: ₱124,950</p>
                      <p className="text-yellow-700">Recorded income entries</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-yellow-300">
                    <p className="text-yellow-900 font-bold">Difference: ₱500</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      The Bookkeeper can investigate this discrepancy to identify which transaction was not recorded or recorded incorrectly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reconciliation History */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Treasurer</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Bookkeeper</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Difference</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {reconciliationHistory.map((record, idx) => (
                <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900 font-medium">{record.date}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900">₱{record.treasurer.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900">₱{record.bookkeeper.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                    {record.difference === 0 ? '-' : `₱${record.difference.toLocaleString()}`}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      record.status === 'matched' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {record.status === 'matched' ? '✓ Matched' : '⚠ Discrepancy'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-2">What is Reconciliation?</h4>
            <p className="text-sm text-blue-800">
              Reconciliation compares the Treasurer's actual cash transactions with the Bookkeeper's financial records. 
              This helps identify discrepancies, ensures accuracy, and maintains financial integrity. When records don't match, 
              the Bookkeeper can investigate which transaction might be missing or recorded incorrectly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reconciliation;

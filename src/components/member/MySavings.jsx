import React from 'react';
import InfoIcon from '../common/InfoIcon';

const MySavings = () => {
  const savingsHistory = [
    { id: 1, date: 'May 29', activity: 'Deposit', amount: 2000, balance: 25450 },
    { id: 2, date: 'May 20', activity: 'Withdrawal', amount: -1000, balance: 23450 },
    { id: 3, date: 'May 10', activity: 'Deposit', amount: 3000, balance: 24450 },
    { id: 4, date: 'April 25', activity: 'Deposit', amount: 2000, balance: 21450 },
    { id: 5, date: 'April 15', activity: 'Withdrawal', amount: -500, balance: 19450 }
  ];

  return (
    <div className="space-y-6">
      {/* Current Balance Card */}
      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium opacity-90">Current Savings Balance</p>
          <InfoIcon text="Your total available balance in your savings account" position="right" />
        </div>
        <p className="text-5xl font-bold mt-2">₱25,450.00</p>
        <div className="flex items-center space-x-6 mt-6">
          <div>
            <div className="flex items-center space-x-1">
              <p className="text-xs opacity-80">Total Deposits</p>
              <InfoIcon text="Sum of all money you've deposited" position="top" />
            </div>
            <p className="text-lg font-semibold">₱42,000</p>
          </div>
          <div>
            <div className="flex items-center space-x-1">
              <p className="text-xs opacity-80">Total Withdrawals</p>
              <InfoIcon text="Sum of all money you've withdrawn" position="top" />
            </div>
            <p className="text-lg font-semibold">₱16,550</p>
          </div>
          <div>
            <div className="flex items-center space-x-1">
              <p className="text-xs opacity-80">Interest Earned</p>
              <InfoIcon text="Annual dividends and interest based on cooperative policy" position="top" />
            </div>
            <p className="text-lg font-semibold">₱0.00</p>
          </div>
        </div>
      </div>

      {/* Savings Summary */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Savings Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-gray-700">Total Deposits</p>
            <p className="text-2xl font-bold text-green-600 mt-1">₱42,000.00</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-gray-700">Total Withdrawals</p>
            <p className="text-2xl font-bold text-red-600 mt-1">₱16,550.00</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-gray-700">Current Balance</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">₱25,450.00</p>
          </div>
        </div>
      </div>

      {/* Recent History */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Savings History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Activity</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Balance</th>
              </tr>
            </thead>
            <tbody>
              {savingsHistory.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{item.date}</td>
                  <td className="py-3 px-4 text-sm text-gray-900">{item.activity}</td>
                  <td className={`py-3 px-4 text-sm text-right font-medium ${
                    item.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.amount > 0 ? '+' : ''}₱{Math.abs(item.amount).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">
                    ₱{item.balance.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Important Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-900">View Only</p>
            <p className="text-sm text-amber-700 mt-1">
              This is a view-only record of your savings account. To make a deposit or withdrawal, please submit a request or visit the cooperative office.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MySavings;

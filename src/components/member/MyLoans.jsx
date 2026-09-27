import React from 'react';

const MyLoans = () => {
  const paymentSchedule = [
    { id: 1, dueDate: 'April 10', amount: 2500, status: 'Paid', color: 'green' },
    { id: 2, dueDate: 'May 10', amount: 2500, status: 'Paid', color: 'green' },
    { id: 3, dueDate: 'June 10', amount: 2500, status: 'Upcoming', color: 'blue' },
    { id: 4, dueDate: 'July 10', amount: 2500, status: 'Upcoming', color: 'gray' },
    { id: 5, dueDate: 'August 10', amount: 2500, status: 'Upcoming', color: 'gray' }
  ];

  const getStatusColor = (color) => {
    const colors = {
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[color];
  };

  return (
    <div className="space-y-6">
      {/* Current Loan Card */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-8 text-white">
        <p className="text-sm font-medium opacity-90">Agricultural Loan</p>
        <p className="text-5xl font-bold mt-2">₱32,500</p>
        <p className="text-sm opacity-90 mt-1">Remaining Balance</p>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-xs opacity-80">Original Amount</p>
            <p className="text-lg font-semibold">₱50,000</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Monthly Payment</p>
            <p className="text-lg font-semibold">₱2,500</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Next Due</p>
            <p className="text-lg font-semibold">June 10, 2026</p>
          </div>
        </div>
      </div>

      {/* Loan Details */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Loan Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Loan Type</label>
            <div className="text-lg font-semibold text-gray-900">Agricultural Loan</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Loan Status</label>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium border border-green-200">
              Active
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Original Amount</label>
            <div className="text-lg font-semibold text-gray-900">₱50,000.00</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Remaining Balance</label>
            <div className="text-lg font-semibold text-orange-600">₱32,500.00</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interest Rate</label>
            <div className="text-lg font-semibold text-gray-900">5% per annum</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Amount</label>
            <div className="text-lg font-semibold text-gray-900">₱2,500.00 / month</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Frequency</label>
            <div className="text-lg font-semibold text-gray-900">Monthly</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Next Due Date</label>
            <div className="text-lg font-semibold text-red-600">June 10, 2026</div>
          </div>
        </div>
      </div>

      {/* Payment Progress */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Progress</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-700">₱17,500 paid of ₱50,000</span>
              <span className="font-medium text-gray-900">35% Complete</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full" style={{ width: '35%' }}></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-2xl font-bold text-green-600">7</p>
              <p className="text-xs text-gray-600">Paid</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-2xl font-bold text-blue-600">13</p>
              <p className="text-xs text-gray-600">Remaining</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-2xl font-bold text-gray-900">20</p>
              <p className="text-xs text-gray-600">Total Months</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Schedule */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Schedule</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Due Date</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {paymentSchedule.map((payment) => (
                <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{payment.dueDate}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">
                    ₱{payment.amount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(payment.color)}`}>
                      {payment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Reminder */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-900">Payment Reminder</p>
            <p className="text-sm text-red-700 mt-1">
              Your next loan payment of ₱2,500 is due on June 10, 2026. Please visit the cooperative office to make your payment. Late payments may incur penalties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyLoans;

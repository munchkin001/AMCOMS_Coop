import React from 'react';

const MyTimeDeposit = () => {
  return (
    <div className="space-y-6">
      {/* Time Deposit Card */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-90">Time Deposit #TD-00125</p>
            <p className="text-5xl font-bold mt-2">₱50,000.00</p>
            <div className="flex items-center space-x-1 mt-2">
              <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs font-medium">
                Active
              </span>
            </div>
          </div>
          <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Time Deposit Details */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Time Deposit Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Principal Amount</label>
            <div className="text-2xl font-bold text-gray-900">₱50,000.00</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interest Rate</label>
            <div className="text-2xl font-bold text-indigo-600">4.0%</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Placed</label>
            <div className="text-lg font-semibold text-gray-900">January 15, 2026</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Maturity Date</label>
            <div className="text-lg font-semibold text-gray-900">January 15, 2027</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Interest</label>
            <div className="text-lg font-semibold text-green-600">₱2,000.00</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Maturity Amount</label>
            <div className="text-lg font-semibold text-green-600">₱52,000.00</div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium border border-green-200 inline-block">
              Active - Earning Interest
            </span>
          </div>
        </div>
      </div>

      {/* Maturity Timeline */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Maturity Timeline</h3>
        <div className="relative">
          {/* Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full" style={{ width: '40%' }}></div>
          </div>
          
          {/* Milestones */}
          <div className="flex justify-between mt-4">
            <div className="text-center">
              <div className="w-3 h-3 bg-indigo-600 rounded-full mx-auto mb-2"></div>
              <p className="text-xs font-medium text-gray-700">Start Date</p>
              <p className="text-xs text-gray-500">Jan 15, 2026</p>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 bg-indigo-400 rounded-full mx-auto mb-2"></div>
              <p className="text-xs font-medium text-gray-700">Current</p>
              <p className="text-xs text-gray-500">~5 months</p>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 bg-gray-300 rounded-full mx-auto mb-2"></div>
              <p className="text-xs font-medium text-gray-700">Maturity Date</p>
              <p className="text-xs text-gray-500">Jan 15, 2027</p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-indigo-900">Time Remaining</p>
              <p className="text-sm text-indigo-700">Approximately 7 months until maturity</p>
            </div>
          </div>
        </div>
      </div>

      {/* Important Information */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-900">Early Withdrawal Notice</p>
            <p className="text-sm text-amber-700 mt-1">
              Early withdrawal before maturity date may result in reduced or forfeited interest earnings. Please visit the cooperative office to discuss options.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyTimeDeposit;

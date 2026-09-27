import React, { useState } from 'react';

const OperationsMonitoring = () => {
  const [activeTab, setActiveTab] = useState('loans');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'loans'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Loan Monitoring
          </button>
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'savings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Savings & Time Deposits
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'inventory'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Inventory Monitoring
          </button>
        </div>
      </div>

      {/* Loan Monitoring */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Active Loans</p>
              <p className="text-3xl font-bold text-blue-600">156</p>
              <p className="text-xs text-gray-500 mt-1">₱2,450,000 total</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Pending Loans</p>
              <p className="text-3xl font-bold text-yellow-600">12</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting approval</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Paid Loans</p>
              <p className="text-3xl font-bold text-green-600">85</p>
              <p className="text-xs text-gray-500 mt-1">This year</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Overdue Loans</p>
              <p className="text-3xl font-bold text-red-600">10</p>
              <p className="text-xs text-gray-500 mt-1">Requires action</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Loan Activity</h3>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Juan Dela Cruz - Loan Payment</p>
                    <p className="text-xs text-gray-500">Today, 10:30 AM</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">₱5,000</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Savings & Time Deposits */}
      {activeTab === 'savings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Savings */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Savings Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-sm text-gray-700">Total Savings</span>
                  <span className="text-lg font-bold text-green-600">₱1,320,000</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Active Accounts</span>
                  <span className="text-lg font-bold text-gray-900">245</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Deposits</span>
                  <span className="text-lg font-bold text-blue-600">45 today</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Withdrawals</span>
                  <span className="text-lg font-bold text-orange-600">12 today</span>
                </div>
              </div>
            </div>

            {/* Time Deposits */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Deposits Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm text-gray-700">Total Time Deposits</span>
                  <span className="text-lg font-bold text-purple-600">₱980,000</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Active Deposits</span>
                  <span className="text-lg font-bold text-gray-900">89</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Maturing This Week</span>
                  <span className="text-lg font-bold text-yellow-600">3</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Placements</span>
                  <span className="text-lg font-bold text-blue-600">7 this week</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Monitoring */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Total Products</p>
              <p className="text-3xl font-bold text-gray-900">24</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Available Stock</p>
              <p className="text-3xl font-bold text-green-600">17</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Low Stock</p>
              <p className="text-3xl font-bold text-yellow-600">5</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Out of Stock</p>
              <p className="text-3xl font-bold text-red-600">2</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">Coconut Sugar</p>
                  <p className="text-xs text-gray-600">Current Stock: 50 kg</p>
                </div>
                <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full">
                  LOW STOCK
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">Turmeric Powder</p>
                  <p className="text-xs text-gray-600">Current Stock: 0 kg</p>
                </div>
                <span className="bg-red-100 text-red-800 text-xs font-semibold px-3 py-1 rounded-full">
                  OUT OF STOCK
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">Brown Sugar</p>
                  <p className="text-xs text-gray-600">Current Stock: 250 kg</p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                  IN STOCK
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsMonitoring;

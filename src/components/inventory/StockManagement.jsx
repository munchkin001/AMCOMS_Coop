import React, { useState } from 'react';

const StockManagement = () => {
  const [activeTab, setActiveTab] = useState('stock-in');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('stock-in')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'stock-in'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Stock In
          </button>
          <button
            onClick={() => setActiveTab('stock-out')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'stock-out'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Stock Out
          </button>
        </div>
      </div>

      {/* Stock In Content */}
      {activeTab === 'stock-in' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Stock In</h3>
          <p className="text-gray-600 mb-4">
            Used when products are added to inventory (newly produced, received from suppliers, agricultural products received at BFT, returned products).
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Coconut Sugar</option>
                <option>Turmeric</option>
                <option>Coconut Crunch</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <input type="number" placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Production</option>
                <option>Supplier</option>
                <option>BFT</option>
                <option>Returned</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
              <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
            </div>
            <button className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
              Record Stock In
            </button>
          </div>
        </div>
      )}

      {/* Stock Out Content */}
      {activeTab === 'stock-out' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Stock Out</h3>
          <p className="text-gray-600 mb-4">
            Used when products leave inventory (sold, transferred, damaged, expired, or other authorized releases).
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Coconut Sugar</option>
                <option>Turmeric</option>
                <option>Coconut Crunch</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <input type="number" placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Sold</option>
                <option>Damaged</option>
                <option>Expired</option>
                <option>Lost</option>
                <option>Transferred</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
              <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
            </div>
            <button className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
              Record Stock Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;

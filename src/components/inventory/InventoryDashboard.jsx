import React from 'react';

const InventoryDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-700 to-teal-800 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Inventory Dashboard</h2>
        <p className="text-teal-100">Welcome to the AMCOMS Inventory Portal</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Products</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Low Stock Items</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Stock Value</p>
          <p className="text-3xl font-bold text-gray-900">₱0</p>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;

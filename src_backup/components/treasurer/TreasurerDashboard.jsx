import React from 'react';

const TreasurerDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-700 to-green-800 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Treasurer Dashboard</h2>
        <p className="text-green-100">Welcome to the AMCOMS Treasurer Portal</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Today's Collections</p>
          <p className="text-3xl font-bold text-gray-900">₱0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Deposits</p>
          <p className="text-3xl font-bold text-gray-900">₱0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Pending Disbursements</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
      </div>
    </div>
  );
};

export default TreasurerDashboard;

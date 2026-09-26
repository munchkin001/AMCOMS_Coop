import React from 'react';

const BookkeeperDashboard = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-orange-700 to-orange-800 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Bookkeeper Dashboard</h2>
        <p className="text-orange-100">Welcome to the AMCOMS Bookkeeper Portal</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Journal Entries</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Pending Posting</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Accounts</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
        </div>
      </div>
    </div>
  );
};

export default BookkeeperDashboard;

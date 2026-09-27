import React, { useState } from 'react';

const InventoryHistory = () => {
  const [filters, setFilters] = useState({ product: '', activity: '', dateFrom: '', dateTo: '' });

  const history = [
    { date: '2026-06-03', product: 'Coconut Sugar', activity: 'Production', quantity: '+50 kg', type: 'production' },
    { date: '2026-06-03', product: 'Coconut Sugar', activity: 'Sold', quantity: '-20 packs', type: 'out' },
    { date: '2026-06-03', product: 'Turmeric', activity: 'Received', quantity: '+30 packs', type: 'in' },
    { date: '2026-06-03', product: 'Coconut Crunch', activity: 'Sold', quantity: '-10 packs', type: 'out' },
    { date: '2026-06-02', product: 'Coconut Sugar', activity: 'Damaged', quantity: '-3 packs', type: 'damaged' },
    { date: '2026-06-02', product: 'Coconut Sugar', activity: 'Production', quantity: '+45 kg', type: 'production' },
    { date: '2026-06-01', product: 'Coconut Sugar', activity: 'Sold', quantity: '-15 packs', type: 'out' },
    { date: '2026-06-01', product: 'Turmeric', activity: 'Expired', quantity: '-5 packs', type: 'expired' }
  ];

  const getActivityBadge = (type) => {
    const types = {
      production: 'bg-blue-100 text-blue-800',
      in: 'bg-green-100 text-green-800',
      out: 'bg-orange-100 text-orange-800',
      damaged: 'bg-red-100 text-red-800',
      expired: 'bg-red-100 text-red-800'
    };
    return types[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Search & Filter</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <select
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Products</option>
              <option>Coconut Sugar</option>
              <option>Turmeric</option>
              <option>Coconut Crunch</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Activity</label>
            <select
              value={filters.activity}
              onChange={(e) => setFilters({ ...filters, activity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Activities</option>
              <option>Production</option>
              <option>Stock In</option>
              <option>Stock Out</option>
              <option>Damaged</option>
              <option>Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <div className="flex space-x-3 mt-4">
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
            Reset Filters
          </button>
          <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Inventory History Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Inventory Movement History</h3>
          <p className="text-sm text-gray-600 mt-1">Complete record of all stock movements and activities</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Product</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Activity</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">{record.date}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{record.product}</td>
                  <td className="py-3 px-6">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getActivityBadge(record.type)}`}>
                      {record.activity}
                    </span>
                  </td>
                  <td className={`py-3 px-6 text-sm text-right font-semibold ${
                    record.quantity.startsWith('+') ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {record.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Why did stock change?</strong> This history helps you track all inventory movements and understand stock level changes.
        </p>
      </div>
    </div>
  );
};

export default InventoryHistory;

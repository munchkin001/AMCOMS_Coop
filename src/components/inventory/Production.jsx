import React from 'react';

const Production = () => {
  const recentProduction = [
    { date: '2026-06-03', product: 'Coconut Sugar', rawMaterial: 'Coconut Sap', quantity: '50 kg', batch: 'CS-06032026-01' },
    { date: '2026-06-02', product: 'Coconut Sugar', rawMaterial: 'Coconut Sap', quantity: '45 kg', batch: 'CS-06022026-01' },
    { date: '2026-06-01', product: 'Coconut Sugar', rawMaterial: 'Coconut Sap', quantity: '52 kg', batch: 'CS-06012026-01' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-600">Record and monitor coconut sugar production and other processing activities</p>
        <button className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium">
          + Record Production
        </button>
      </div>

      {/* Production Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">New Production Record</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Production Date</label>
              <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Coconut Sugar</option>
                <option>Coconut Crunch</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Raw Material / Input</label>
            <input type="text" placeholder="e.g., Coconut Sap" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity Produced</label>
              <input type="number" placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>kg</option>
                <option>pack</option>
                <option>liter</option>
                <option>piece</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Batch Number</label>
            <input type="text" placeholder="e.g., CS-06032026-01" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
            <textarea rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
          </div>
          <button className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
            Record Production
          </button>
        </div>
      </div>

      {/* Production Flow Diagram */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 className="font-semibold text-blue-900 mb-3">Production Flow Example</h4>
        <div className="flex items-center justify-between text-sm text-blue-800">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl">🥥</span>
            </div>
            <p className="font-medium">Coconut Sap</p>
          </div>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl">🏭</span>
            </div>
            <p className="font-medium">Production</p>
          </div>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl">📦</span>
            </div>
            <p className="font-medium">50 kg Produced</p>
          </div>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl">✅</span>
            </div>
            <p className="font-medium">Stock Updated</p>
          </div>
        </div>
      </div>

      {/* Recent Production Records */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Production Records</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Product</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Raw Material</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Quantity</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Batch Number</th>
              </tr>
            </thead>
            <tbody>
              {recentProduction.map((record, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">{record.date}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{record.product}</td>
                  <td className="py-3 px-6 text-sm text-gray-600">{record.rawMaterial}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-semibold">{record.quantity}</td>
                  <td className="py-3 px-6 text-sm text-gray-600 font-mono">{record.batch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Production;

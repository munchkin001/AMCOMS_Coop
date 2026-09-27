import React from 'react';

const Products = () => {
  const products = [
    { id: 'PRD-001', name: 'Coconut Sugar', category: 'Processed Product', unit: 'Pack', stock: 120, minStock: 30, status: 'Good', icon: '🥥' },
    { id: 'PRD-002', name: 'Turmeric', category: 'Agricultural Product', unit: 'Pack', stock: 15, minStock: 20, status: 'Low', icon: '🌿' },
    { id: 'PRD-003', name: 'Coconut Crunch', category: 'Processed Product', unit: 'Pack', stock: 45, minStock: 25, status: 'Good', icon: '🍪' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-600">Manage cooperative products and inventory items</p>
        <button className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium">
          + Add New Product
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-4xl">{product.icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-600">ID: {product.id} • {product.category}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                product.status === 'Good' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {product.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-xs text-gray-500">Unit</p>
                <p className="text-sm font-semibold text-gray-900">{product.unit}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Current Stock</p>
                <p className="text-sm font-semibold text-gray-900">{product.stock}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Min Stock Level</p>
                <p className="text-sm font-semibold text-gray-900">{product.minStock}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                  Edit
                </button>
                <button className="flex-1 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium">
                  View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Product Management:</strong> Add new products, update information, set minimum stock levels, and monitor product status.
        </p>
      </div>
    </div>
  );
};

export default Products;

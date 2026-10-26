import React, { useState } from 'react';
import { getRecordBadgeClasses, getRoleDotClasses } from '../../utils/portalColors';

const FinancialRecords = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [recordType, setRecordType] = useState('income');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [formData, setFormData] = useState({
    type: 'income',
    category: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    remarks: ''
  });

  const records = [
    { id: 1, date: '2026-06-03', type: 'Income', category: 'Product Sales', description: 'Coconut Sugar Sales', amount: 5000, ref: 'INC-2026-0045', recordedBy: 'BOOKKEEPER' },
    { id: 2, date: '2026-06-03', type: 'Expense', category: 'Utilities', description: 'Electricity Bill', amount: 2500, ref: 'EXP-2026-0031', recordedBy: 'BOOKKEEPER' },
    { id: 3, date: '2026-06-02', type: 'Expense', category: 'Transportation', description: 'Delivery Expenses', amount: 800, ref: 'EXP-2026-0030', recordedBy: 'BOOKKEEPER' },
    { id: 4, date: '2026-06-02', type: 'Income', category: 'Membership Fees', description: 'New Member Registration', amount: 1500, ref: 'INC-2026-0044', recordedBy: 'BOOKKEEPER' },
    { id: 5, date: '2026-06-01', type: 'Income', category: 'Product Sales', description: 'Turmeric Sales', amount: 3200, ref: 'INC-2026-0043', recordedBy: 'BOOKKEEPER' },
    { id: 6, date: '2026-06-01', type: 'Expense', category: 'Office Supplies', description: 'Printer Paper & Ink', amount: 1200, ref: 'EXP-2026-0029', recordedBy: 'BOOKKEEPER' },
    { id: 7, date: '2026-05-31', type: 'Income', category: 'Loan Interest', description: 'Monthly Loan Interest', amount: 8500, ref: 'INC-2026-0042', recordedBy: 'TREASURER' },
    { id: 8, date: '2026-05-31', type: 'Expense', category: 'Maintenance', description: 'Office Repairs', amount: 4500, ref: 'EXP-2026-0028', recordedBy: 'BOOKKEEPER' }
  ];

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.ref.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || record.type.toLowerCase() === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleAddRecord = () => {
    if (!formData.category || !formData.description || !formData.amount) {
      alert('Please fill in required fields');
      return;
    }

    const refPrefix = formData.type === 'income' ? 'INC' : 'EXP';
    const refNumber = `${refPrefix}-2026-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    alert(`Financial record added successfully!\nReference: ${refNumber}\nAmount: ₱${parseFloat(formData.amount).toLocaleString()}\nType: ${formData.type.toUpperCase()}`);
    
    setFormData({
      type: 'income',
      category: '',
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      remarks: ''
    });
    setShowAddModal(false);
  };

  const incomeCategories = [
    'Product Sales',
    'Membership Fees',
    'Loan Interest',
    'Other Income'
  ];

  const expenseCategories = [
    'Utilities',
    'Transportation',
    'Office Supplies',
    'Maintenance',
    'Salaries',
    'Other Expenses'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Financial Record</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Records</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by description or reference..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Records</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Total Income</p>
          <p className="text-2xl font-bold text-green-600">
            ₱{filteredRecords.filter(r => r.type === 'Income').reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">
            ₱{filteredRecords.filter(r => r.type === 'Expense').reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Net Amount</p>
          <p className="text-2xl font-bold text-purple-600">
            ₱{(
              filteredRecords.filter(r => r.type === 'Income').reduce((sum, r) => sum + r.amount, 0) -
              filteredRecords.filter(r => r.type === 'Expense').reduce((sum, r) => sum + r.amount, 0)
            ).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Reference</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Category</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Description</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Recorded By</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Amount</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">{record.date}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 font-mono">{record.ref}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      record.type === 'Income' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">{record.category}</td>
                  <td className="py-3 px-4 text-sm text-gray-900 font-medium">{record.description}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${getRecordBadgeClasses(record.recordedBy)}`}>
                      <span className={`w-2 h-2 rounded-full ${getRoleDotClasses(record.recordedBy)}`}></span>
                      <span>{record.recordedBy}</span>
                    </span>
                  </td>
                  <td className={`py-3 px-4 text-sm text-right font-semibold ${
                    record.type === 'Income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {record.type === 'Income' ? '+' : '-'}₱{record.amount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Add Financial Record</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Record Type *</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="income"
                      checked={formData.type === 'income'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value, category: '' })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Income</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="expense"
                      checked={formData.type === 'expense'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value, category: '' })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Expense</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select Category</option>
                  {(formData.type === 'income' ? incomeCategories : expenseCategories).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Electricity Bill"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Remarks (Optional)</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRecord}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Add Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialRecords;

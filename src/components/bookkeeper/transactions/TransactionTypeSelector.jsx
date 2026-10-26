import React from 'react';
import { ArrowDownLeft, ArrowUpRight, FileText, HandCoins, Landmark, ShoppingCart } from 'lucide-react';

const TransactionTypeSelector = ({ onSelectType, onCancel }) => {
  const transactionTypes = [
    {
      id: 'cash-receipt',
      name: 'Cash Receipt',
      icon: ArrowDownLeft,
      description: 'Record money received',
      color: 'bg-green-50 border-green-200 hover:bg-green-100'
    },
    {
      id: 'cash-disbursement',
      name: 'Cash Disbursement',
      icon: ArrowUpRight,
      description: 'Record money paid out',
      color: 'bg-red-50 border-red-200 hover:bg-red-100'
    },
    {
      id: 'sales',
      name: 'Sales',
      icon: ShoppingCart,
      description: 'Record a product or service sale, paid or on credit',
      color: 'bg-orange-50 border-orange-200 hover:bg-orange-100'
    },
    {
      id: 'loan-payment',
      name: 'Loan Payment',
      icon: HandCoins,
      description: 'Record a member payment against an existing loan',
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100'
    },
    {
      id: 'savings-deposit',
      name: 'Savings / Deposit',
      icon: Landmark,
      description: 'Record regular savings or time-deposit activity',
      color: 'bg-teal-50 border-teal-200 hover:bg-teal-100'
    },
    {
      id: 'other-transaction',
      name: 'Other Transaction',
      icon: FileText,
      description: 'Record capital contributions or approved dividends',
      color: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">New Transaction</h2>
        </div>
        <button
          onClick={onCancel}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {transactionTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => onSelectType(type.id)}
            className={`${type.color} border-2 rounded-xl p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2`}
          >
            <div className="mb-3 inline-flex rounded-lg bg-white p-2 text-gray-700 shadow-sm">
              <type.icon size={20} aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">{type.name}</h3>
            <p className="text-sm text-gray-600">{type.description}</p>
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-3xl">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Sales, loan payments, and member deposits post to the cash book and their related business records together.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default TransactionTypeSelector;

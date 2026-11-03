import React, { useState } from 'react';
import CashReceiptsBook from './books/CashReceiptsBook';
import CashDisbursementsBook from './books/CashDisbursementsBook';
import GeneralJournal from './books/GeneralJournal';
import Ledger from './books/Ledger';

const Books = () => {
  const [activeBook, setActiveBook] = useState('cash-receipts');
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  }));
  const periods = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-semibold text-gray-900">Books</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
            >
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm lg:text-base flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveBook('cash-receipts')}
            className={`flex-1 px-2 sm:px-4 lg:px-6 py-3 lg:py-4 font-medium transition-colors text-xs sm:text-sm lg:text-base whitespace-nowrap ${
              activeBook === 'cash-receipts' 
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Cash Receipts
          </button>
          <button
            onClick={() => setActiveBook('cash-disbursements')}
            className={`flex-1 px-2 sm:px-4 lg:px-6 py-3 lg:py-4 font-medium transition-colors text-xs sm:text-sm lg:text-base whitespace-nowrap ${
              activeBook === 'cash-disbursements' 
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Cash Disbursements
          </button>
          <button
            onClick={() => setActiveBook('general-journal')}
            className={`flex-1 px-2 sm:px-4 lg:px-6 py-3 lg:py-4 font-medium transition-colors text-xs sm:text-sm lg:text-base whitespace-nowrap ${
              activeBook === 'general-journal' 
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            General Journal
          </button>
          <button
            onClick={() => setActiveBook('ledger')}
            className={`flex-1 px-2 sm:px-4 lg:px-6 py-3 lg:py-4 font-medium transition-colors text-xs sm:text-sm lg:text-base whitespace-nowrap ${
              activeBook === 'ledger' 
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Ledger
          </button>
        </div>
      </div>

      {/* Book Content */}
      <div>
        {activeBook === 'cash-receipts' && <CashReceiptsBook period={period} />}
        {activeBook === 'cash-disbursements' && <CashDisbursementsBook period={period} />}
        {activeBook === 'general-journal' && <GeneralJournal period={period} />}
        {activeBook === 'ledger' && <Ledger period={period} />}
      </div>
    </div>
  );
};

export default Books;

import React from 'react';

const CashDisbursementsBook = ({ period = 'April 2026' }) => {
  const entries = [
    { date: 'Apr 3', particulars: 'Office Supplies', ref: 'CD-001', cashOnHand: 2000, cashInBank: 0, expense: 2000, accountReceivable: 0, accountPayable: 0 },
    { date: 'Apr 5', particulars: 'Payment to Supplier', ref: 'CD-002', cashOnHand: 0, cashInBank: 5000, expense: 0, accountReceivable: 0, accountPayable: 5000 },
    { date: 'Apr 7', particulars: 'Utilities', ref: 'CD-003', cashOnHand: 1500, cashInBank: 0, expense: 1500, accountReceivable: 0, accountPayable: 0 },
  ];

  const totals = entries.reduce((acc, entry) => ({
    cashOnHand: acc.cashOnHand + entry.cashOnHand,
    cashInBank: acc.cashInBank + entry.cashInBank,
    expense: acc.expense + entry.expense,
    accountReceivable: acc.accountReceivable + entry.accountReceivable,
    accountPayable: acc.accountPayable + entry.accountPayable,
  }), { cashOnHand: 0, cashInBank: 0, expense: 0, accountReceivable: 0, accountPayable: 0 });

  const formatAmount = (amount) => amount === 0 ? '-' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Cash Disbursements Book</strong> – Records all money paid out by the cooperative.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Particulars</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">DV/Ref. No.</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Cash on Hand</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Cash in Bank</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Expense</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">A/R</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">A/P</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                  <td className="px-3 py-3 text-sm text-gray-900">{entry.particulars}</td>
                  <td className="px-3 py-3 text-sm font-medium text-purple-600 whitespace-nowrap cursor-pointer">{entry.ref}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.cashOnHand)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.cashInBank)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.expense)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.accountReceivable)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.accountPayable)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-purple-50 border-t-2 border-purple-200">
              <tr>
                <td colSpan="3" className="px-3 py-3 text-sm font-bold text-gray-900">TOTALS</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">{formatAmount(totals.cashOnHand)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">{formatAmount(totals.cashInBank)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">{formatAmount(totals.expense)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">{formatAmount(totals.accountReceivable)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">{formatAmount(totals.accountPayable)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashDisbursementsBook;

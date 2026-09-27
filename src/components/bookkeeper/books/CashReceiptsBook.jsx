import React from 'react';

const CashReceiptsBook = ({ period = 'April 2026' }) => {
  // Sample data matching actual cooperative format
  const entries = [
    { 
      date: 'Apr 1', 
      particulars: 'Sales', 
      ref: 'OR-001', 
      cashOnHand: 130, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 0, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 0, 
      capitalShare: 0 
    },
    { 
      date: 'Apr 1', 
      particulars: 'Loan Payment – Juan Andoy', 
      ref: 'OR-002', 
      cashOnHand: 5556, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 5556, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 0, 
      capitalShare: 0 
    },
    { 
      date: 'Apr 2', 
      particulars: 'Interest Income', 
      ref: 'OR-003', 
      cashOnHand: 4487.32, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 0, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 0, 
      capitalShare: 0 
    },
    { 
      date: 'Apr 2', 
      particulars: 'Service Fee', 
      ref: 'OR-004', 
      cashOnHand: 279, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 0, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 0, 
      capitalShare: 0 
    },
    { 
      date: 'Apr 3', 
      particulars: 'Savings Deposit – Maria Santos', 
      ref: 'OR-005', 
      cashOnHand: 600, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 0, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 600, 
      capitalShare: 0 
    },
    { 
      date: 'Apr 5', 
      particulars: 'Time Deposit – Pedro Reyes', 
      ref: 'OR-006', 
      cashOnHand: 10000, 
      cashInBank: 0, 
      accountReceivable: 0, 
      loanReceivable: 0, 
      accountPayable: 0, 
      loanPayable: 0, 
      savingsTimeDeposit: 10000, 
      capitalShare: 0 
    },
  ];

  // Calculate totals
  const totals = entries.reduce((acc, entry) => ({
    cashOnHand: acc.cashOnHand + entry.cashOnHand,
    cashInBank: acc.cashInBank + entry.cashInBank,
    accountReceivable: acc.accountReceivable + entry.accountReceivable,
    loanReceivable: acc.loanReceivable + entry.loanReceivable,
    accountPayable: acc.accountPayable + entry.accountPayable,
    loanPayable: acc.loanPayable + entry.loanPayable,
    savingsTimeDeposit: acc.savingsTimeDeposit + entry.savingsTimeDeposit,
    capitalShare: acc.capitalShare + entry.capitalShare,
  }), {
    cashOnHand: 0,
    cashInBank: 0,
    accountReceivable: 0,
    loanReceivable: 0,
    accountPayable: 0,
    loanPayable: 0,
    savingsTimeDeposit: 0,
    capitalShare: 0,
  });

  const formatAmount = (amount) => {
    return amount === 0 ? '-' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Cash Receipts Book</strong> – Digital version of your cooperative's physical Cash Receipts Book. 
          Click any reference number to view the original transaction.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Particulars</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Ref/CV #</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Cash on Hand</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Cash in Bank</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">A/R</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Loan Receivable</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">A/P</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Loan Payable</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Savings/TD</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Capital Share</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                  <td className="px-3 py-3 text-sm text-gray-900">{entry.particulars}</td>
                  <td className="px-3 py-3 text-sm font-medium text-purple-600 whitespace-nowrap cursor-pointer hover:text-purple-700">
                    {entry.ref}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.cashOnHand)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.cashInBank)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.accountReceivable)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.loanReceivable)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.accountPayable)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.loanPayable)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.savingsTimeDeposit)}</td>
                  <td className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.capitalShare)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-purple-50 border-t-2 border-purple-200">
              <tr>
                <td colSpan="3" className="px-3 py-3 text-sm font-bold text-gray-900">TOTALS</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.cashOnHand)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.cashInBank)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.accountReceivable)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.loanReceivable)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.accountPayable)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.loanPayable)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.savingsTimeDeposit)}</td>
                <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals.capitalShare)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashReceiptsBook;

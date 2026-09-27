import React, { useState } from 'react';

const Ledger = ({ period = 'April 2026' }) => {
  const [selectedAccount, setSelectedAccount] = useState('Loan Receivable');

  const accounts = [
    'Cash on Hand',
    'Cash in Bank',
    'Account Receivable',
    'Loan Receivable',
    'Savings / Time Deposit',
    'Capital Share',
    'Sales',
    'Interest Income',
    'Expenses'
  ];

  const ledgerData = {
    'Loan Receivable': {
      balance: 44444,
      entries: [
        { date: 'Apr 1', reference: 'OR-002', particulars: 'Loan Payment – Juan Andoy', debit: 0, credit: 5556, balance: 44444 },
        { date: 'Apr 15', reference: 'OR-015', particulars: 'Loan Payment – Maria Santos', debit: 0, credit: 5000, balance: 39444 },
      ]
    },
    'Cash on Hand': {
      balance: 21052.32,
      entries: [
        { date: 'Apr 1', reference: 'OR-001', particulars: 'Sales', debit: 130, credit: 0, balance: 130 },
        { date: 'Apr 1', reference: 'OR-002', particulars: 'Loan Payment', debit: 5556, credit: 0, balance: 5686 },
        { date: 'Apr 2', reference: 'OR-003', particulars: 'Interest Income', debit: 4487.32, credit: 0, balance: 10173.32 },
        { date: 'Apr 3', reference: 'CD-001', particulars: 'Office Supplies', debit: 0, credit: 2000, balance: 8173.32 },
      ]
    }
  };

  const currentLedger = ledgerData[selectedAccount] || { balance: 0, entries: [] };

  const formatAmount = (amount) => amount === 0 ? '-' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Ledger</strong> – Account-specific record showing all debits, credits, and running balance.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm lg:text-base min-w-[200px]"
            >
              {accounts.map((acc) => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Current Balance</p>
            <p className="text-2xl lg:text-3xl font-bold text-purple-600">
              {formatAmount(currentLedger.balance)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Particulars</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentLedger.entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                  <td className="px-4 py-3 text-sm font-medium text-purple-600 whitespace-nowrap cursor-pointer">
                    {entry.reference}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{entry.particulars}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.debit)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.credit)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                    {formatAmount(entry.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {currentLedger.entries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No entries for this account in {period}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Ledger;

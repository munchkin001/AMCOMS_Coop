import React from 'react';

const GeneralJournal = ({ period = 'April 2026' }) => {
  const entries = [
    { date: 'Apr 1', reference: 'OR-001', account: 'Cash on Hand', debit: 130, credit: 0 },
    { date: '', reference: '', account: 'Sales', debit: 0, credit: 130 },
    { date: 'Apr 1', reference: 'OR-002', account: 'Cash on Hand', debit: 5556, credit: 0 },
    { date: '', reference: '', account: 'Loan Receivable', debit: 0, credit: 5556 },
    { date: 'Apr 2', reference: 'OR-003', account: 'Cash on Hand', debit: 4487.32, credit: 0 },
    { date: '', reference: '', account: 'Interest Income', debit: 0, credit: 4487.32 },
    { date: 'Apr 3', reference: 'CD-001', account: 'Office Supplies Expense', debit: 2000, credit: 0 },
    { date: '', reference: '', account: 'Cash on Hand', debit: 0, credit: 2000 },
  ];

  const formatAmount = (amount) => amount === 0 ? '' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>General Journal</strong> – Formal accounting record with debits and credits for all transactions.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Account / Particulars</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Credit</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {entries.map((entry, idx) => (
                <tr key={idx} className={entry.date ? 'border-t-2 border-gray-300' : ''}>
                  <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                  <td className="px-4 py-2 text-sm font-medium text-purple-600 whitespace-nowrap cursor-pointer">
                    {entry.reference}
                  </td>
                  <td className={`px-4 py-2 text-sm text-gray-900 ${!entry.date ? 'pl-8' : ''}`}>
                    {entry.account}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                    {formatAmount(entry.debit)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                    {formatAmount(entry.credit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GeneralJournal;

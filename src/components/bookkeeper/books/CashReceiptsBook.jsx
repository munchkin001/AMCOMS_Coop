import React, { useCallback, useEffect, useState } from 'react';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { supabase } from '../../../lib/supabase';

const CashReceiptsBook = ({ period = 'April 2026' }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEntries = useCallback(async () => {
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('cash_receipts')
        .select('id, receipt_date, receipt_number, received_from, description, status, cash_receipt_lines(amount, side, account:chart_of_accounts(account_name))')
        .order('receipt_date', { ascending: true });
      if (fetchError) throw fetchError;

      setEntries((data || []).map((receipt) => {
        const accounts = {};
        (receipt.cash_receipt_lines || []).forEach((line) => {
          const account = Array.isArray(line.account) ? line.account[0]?.account_name : line.account?.account_name;
          if (account) accounts[account] = (accounts[account] || 0) + Number(line.amount || 0);
        });
        return {
          id: receipt.id,
          date: receipt.receipt_date,
          particulars: `${receipt.description}${receipt.received_from ? ` - ${receipt.received_from}` : ''}`,
          ref: receipt.receipt_number,
          status: receipt.status,
          accounts
        };
      }));
    } catch (fetchError) {
      console.error('Unable to load cash receipts book:', fetchError);
      setError('Cash receipts could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useRealtimeSubscription('cash_receipts', fetchEntries, null, [fetchEntries]);

  const baseAccounts = [
    'Cash on Hand', 'Cash in Bank', 'Account Receivable', 'Loan Receivable',
    'Account Payable', 'Loan Payable', 'Savings / Time Deposit', 'Capital Share',
    'Sales', 'Charge Sales', 'Marketing', 'Barangay Food Terminal (BFT)',
    'Membership Fee', 'Interest Income', 'Service Fee Income', 'Other Income'
  ];
  const accountNames = [...new Set([...baseAccounts, ...entries.flatMap((entry) => Object.keys(entry.accounts))])];
  const totals = accountNames.reduce((result, account) => {
    result[account] = entries.reduce((sum, entry) => sum + (entry.accounts[account] || 0), 0);
    return result;
  }, {});

  const formatAmount = (amount) => {
    return amount === 0 ? '-' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Cash Receipts Book</strong> – Digital version of your cooperative's physical Cash Receipts Book. 
          Receipt allocations and account totals update as transactions are recorded.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Particulars</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Ref/CV #</th>
                {accountNames.map((account) => (
                  <th key={account} className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">{account}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{new Date(`${entry.date}T00:00:00`).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-3 text-sm text-gray-900">{entry.particulars}</td>
                  <td className="px-3 py-3 text-sm font-medium text-purple-600 whitespace-nowrap cursor-pointer hover:text-purple-700">
                    {entry.ref}
                  </td>
                  {accountNames.map((account) => (
                    <td key={account} className="px-3 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.accounts[account] || 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-purple-50 border-t-2 border-purple-200">
              <tr>
                <td colSpan="3" className="px-3 py-3 text-sm font-bold text-gray-900">TOTALS</td>
                {accountNames.map((account) => (
                  <td key={account} className="px-3 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{formatAmount(totals[account])}</td>
                ))}
              </tr>
            </tfoot>
          </table>
          {loading && <p className="p-5 text-center text-sm text-gray-500">Loading cash receipts...</p>}
          {!loading && entries.length === 0 && !error && <p className="p-5 text-center text-sm text-gray-500">No cash receipts recorded for {period}.</p>}
        </div>
      </div>
    </div>
  );
};

export default CashReceiptsBook;

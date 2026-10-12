import React, { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value, decimals = 2) => `₱${Number(value || 0).toLocaleString('en-PH', { 
  minimumFractionDigits: decimals, 
  maximumFractionDigits: decimals 
})}`;

const MSOSavings = () => {
  const { staff } = useAuth();
  const [savingsData, setSavingsData] = useState({
    balance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    interestEarned: 0,
    accountNumber: '',
    accountStatus: '',
    openDate: null,
    transactions: []
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!staff?.member_id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch savings accounts (exclude time deposits)
      const { data: accounts, error: accountError } = await supabase
        .from('savings_accounts')
        .select('id, account_number, balance, account_type, status, date_opened')
        .eq('member_id', staff.member_id)
        .neq('account_type', 'time_deposit')
        .eq('status', 'active')
        .order('date_opened', { ascending: false });

      if (accountError) throw accountError;

      if (!accounts || accounts.length === 0) {
        setSavingsData({
          balance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
          interestEarned: 0,
          accountNumber: '',
          accountStatus: 'none',
          openDate: null,
          transactions: []
        });
        setLoading(false);
        return;
      }

      const account = accounts[0];
      const accountIds = accounts.map(a => a.id);

      // Fetch all transactions for these accounts
      const { data: transactions, error: txError } = await supabase
        .from('savings_transactions')
        .select('id, transaction_type, amount, balance_after, transaction_date, description, reference_number')
        .in('savings_account_id', accountIds)
        .order('transaction_date', { ascending: false })
        .limit(50);

      if (txError) throw txError;

      // Calculate totals
      const txList = transactions || [];
      const totalDeposits = txList
        .filter(tx => !/(withdraw|interest)/i.test(tx.transaction_type))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      
      const totalWithdrawals = txList
        .filter(tx => /withdraw/i.test(tx.transaction_type))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      
      const interestEarned = txList
        .filter(tx => /interest/i.test(tx.transaction_type))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      setSavingsData({
        balance: Number(account.balance || 0),
        totalDeposits,
        totalWithdrawals,
        interestEarned,
        accountNumber: account.account_number || '',
        accountStatus: account.status || 'active',
        openDate: account.date_opened,
        transactions: txList
      });
    } catch (error) {
      console.error('Error loading savings data:', error);
    } finally {
      setLoading(false);
    }
  }, [staff?.member_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time subscriptions
  useMultipleRealtimeSubscriptions([
    { table: 'savings_accounts', onUpdate: load },
    { table: 'savings_transactions', onUpdate: load }
  ], [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-3 text-sm text-gray-600">Loading savings information...</p>
        </div>
      </div>
    );
  }

  if (savingsData.accountStatus === 'none') {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <Wallet className="mx-auto h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Savings Account Yet</h3>
        <p className="mt-2 text-sm text-gray-600">
          Visit the cooperative office to open your savings account and start building your financial future.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Transaction History */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
          <p className="mt-1 text-sm text-gray-600">
            All deposits, withdrawals, and interest credits to your savings account
          </p>
        </div>

        {savingsData.transactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="mt-3 text-sm text-gray-600">No transactions yet</p>
            <p className="mt-1 text-xs text-gray-500">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {savingsData.transactions.map((tx) => {
                  const isWithdrawal = /withdraw/i.test(tx.transaction_type);
                  const isInterest = /interest/i.test(tx.transaction_type);
                  const txDate = new Date(tx.transaction_date);
                  
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {txDate.toLocaleDateString('en-PH', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          isWithdrawal 
                            ? 'bg-rose-100 text-rose-700' 
                            : isInterest
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {tx.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {tx.description || tx.reference_number || '—'}
                      </td>
                      <td className={`whitespace-nowrap px-6 py-4 text-right text-sm font-semibold ${
                        isWithdrawal ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {isWithdrawal ? '−' : '+'}{peso(tx.amount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                        {peso(tx.balance_after)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MSOSavings;

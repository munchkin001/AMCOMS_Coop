import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, TrendingUp, Clock, Banknote } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const peso = (value, decimals = 2) => `₱${Number(value || 0).toLocaleString('en-PH', { 
  minimumFractionDigits: decimals, 
  maximumFractionDigits: decimals 
})}`;

const MSOTimeDeposit = () => {
  const { staff } = useAuth();
  const [timeDepositData, setTimeDepositData] = useState({
    deposits: [],
    totalBalance: 0,
    totalInterest: 0,
    transactions: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!staff?.member_id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch time deposit accounts
      const { data: accounts, error: accountError } = await supabase
        .from('savings_accounts')
        .select('id, account_number, balance, account_type, status, opening_date, interest_rate, maturity_date')
        .eq('member_id', staff.member_id)
        .eq('account_type', 'time_deposit')
        .order('opening_date', { ascending: false });

      if (accountError) throw accountError;

      if (!accounts || accounts.length === 0) {
        setTimeDepositData({
          deposits: [],
          totalBalance: 0,
          totalInterest: 0,
          transactions: []
        });
        setLoading(false);
        return;
      }

      const accountIds = accounts.map(a => a.id);

      // Fetch transactions
      const { data: transactions, error: txError } = await supabase
        .from('savings_transactions')
        .select('id, savings_account_id, transaction_type, amount, balance_after, transaction_date, description')
        .in('savings_account_id', accountIds)
        .eq('status', 'recorded')
        .order('transaction_date', { ascending: false })
        .limit(100);

      if (txError) throw txError;

      // Calculate total interest earned across all deposits
      const txList = transactions || [];
      const totalInterest = txList
        .filter(tx => /interest/i.test(tx.transaction_type))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

      setTimeDepositData({
        deposits: accounts,
        totalBalance,
        totalInterest,
        transactions: txList
      });
      setError('');
    } catch (error) {
      console.error('Error loading time deposit data:', error);
      setError(getDataLoadErrorMessage(error, 'time deposit details'));
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
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
          <p className="mt-3 text-sm text-gray-600">Loading time deposit information...</p>
        </div>
      </div>
    );
  }

  if (timeDepositData.deposits.length === 0) {
    if (error) {
      return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
    }
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <Clock className="mx-auto h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Time Deposits Yet</h3>
        <p className="mt-2 text-sm text-gray-600">
          Open a time deposit account to earn higher interest rates on your savings with fixed terms.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Visit the cooperative office to learn about our time deposit products and rates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-purple-100">Total Time Deposits</p>
              <p className="mt-2 text-3xl font-bold">{peso(timeDepositData.totalBalance)}</p>
              <p className="mt-1 text-xs text-purple-200">{timeDepositData.deposits.length} active {timeDepositData.deposits.length === 1 ? 'deposit' : 'deposits'}</p>
            </div>
            <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
              <Banknote className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Total Interest Earned</p>
              <p className="mt-2 text-3xl font-bold">{peso(timeDepositData.totalInterest)}</p>
            </div>
            <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Active Deposits */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Time Deposit Accounts</h3>
        
        {timeDepositData.deposits.map((deposit) => {
          const openDate = deposit.opening_date ? new Date(`${deposit.opening_date}T00:00:00`) : null;
          const maturityDate = deposit.maturity_date ? new Date(deposit.maturity_date) : null;
          const today = new Date();
          const daysToMaturity = maturityDate ? Math.ceil((maturityDate - today) / (1000 * 60 * 60 * 24)) : null;
          const isMatured = daysToMaturity !== null && daysToMaturity <= 0;
          const termMonths = openDate && maturityDate
            ? (maturityDate.getFullYear() - openDate.getFullYear()) * 12
              + maturityDate.getMonth() - openDate.getMonth()
              - (maturityDate.getDate() < openDate.getDate() ? 1 : 0)
            : null;
          const termLabel = termMonths == null || termMonths <= 0
            ? '—'
            : termMonths % 12 === 0
              ? `${termMonths / 12} ${termMonths === 12 ? 'year' : 'years'}`
              : `${termMonths} months`;
          const accountStatus = deposit.status === 'closed'
            ? 'Closed'
            : deposit.status === 'dormant'
              ? 'Dormant'
              : isMatured
                ? 'Matured'
                : 'Active';

          return (
            <div key={deposit.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">{deposit.account_number}</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Time Deposit Account
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    accountStatus === 'Matured' || accountStatus === 'Active'
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {accountStatus}
                  </span>
                </div>
              </div>

              <div className="p-6">
                {/* Principal Amount */}
                <div className="mb-5">
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="mt-1 text-2xl font-bold text-purple-600">{peso(deposit.balance)}</p>
                </div>

                {/* Deposit Details Grid */}
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
                  <div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <p className="text-xs font-medium">Term</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {termLabel}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <TrendingUp className="h-4 w-4" />
                      <p className="text-xs font-medium">Interest Rate</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {deposit.interest_rate || 0}% p.a.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <p className="text-xs font-medium">Opened</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {openDate
                        ? openDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <p className="text-xs font-medium">Maturity</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {maturityDate 
                        ? maturityDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'
                      }
                    </p>
                  </div>
                </div>

                {/* Maturity Info */}
                {daysToMaturity !== null && (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm font-medium text-green-900">
                      {isMatured 
                        ? 'This time deposit has matured and is ready for withdrawal or renewal.' 
                        : `Matures in ${daysToMaturity} ${daysToMaturity === 1 ? 'day' : 'days'}`
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction History */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
          <p className="mt-1 text-sm text-gray-600">
            All placements, interest credits, and withdrawals
          </p>
        </div>

        {timeDepositData.transactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="mt-3 text-sm text-gray-600">No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {timeDepositData.transactions.map((tx) => {
                  const isInterest = /interest/i.test(tx.transaction_type);
                  const isWithdrawal = /withdraw/i.test(tx.transaction_type);
                  const account = timeDepositData.deposits.find(d => d.id === tx.savings_account_id);
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
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {account?.account_number || '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          isInterest 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : isWithdrawal
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {tx.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {tx.description || '—'}
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

      {/* Info Note */}
      <div className="rounded-lg bg-purple-50 border border-purple-200 p-4">
        <p className="text-sm text-purple-900">
          <span className="font-semibold">Note:</span> Time deposits have fixed terms and interest rates. 
          Early withdrawal may incur penalties. Contact the cooperative office for withdrawal or renewal.
        </p>
      </div>
    </div>
  );
};

export default MSOTimeDeposit;

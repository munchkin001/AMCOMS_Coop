import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value, decimals = 2) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const fmtDate = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const isTimeDeposit = (account) => /time/i.test(account.account_type || '');

const AccountList = ({ kind }) => {
  const { staff } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const label = kind === 'time-deposit' ? 'Time Deposit' : 'Savings';

  const load = useCallback(async () => {
    if (!staff?.member_id) return;
    const { data: rows } = await supabase
      .from('savings_accounts')
      .select('id, balance, account_type')
      .eq('member_id', staff.member_id);
    const matching = (rows || []).filter((account) => (kind === 'time-deposit') === isTimeDeposit(account));
    setAccounts(matching);

    if (matching.length) {
      const { data: txs } = await supabase
        .from('savings_transactions')
        .select('id, transaction_type, amount, balance_after, transaction_date')
        .in('savings_account_id', matching.map((account) => account.id))
        .order('transaction_date', { ascending: false });
      setTransactions(txs || []);
    } else {
      setTransactions([]);
    }
    setLoading(false);
  }, [staff?.member_id, kind]);

  useEffect(() => { load(); }, [load]);
  useMultipleRealtimeSubscriptions([
    { table: 'savings_accounts', onUpdate: load },
    { table: 'savings_transactions', onUpdate: load }
  ], [load]);

  const balance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const sumOf = (predicate) => transactions.filter(predicate).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const isWithdrawal = (tx) => /withdraw/i.test(tx.transaction_type);
  const isInterest = (tx) => /interest/i.test(tx.transaction_type);
  const totalDeposits = sumOf((tx) => !isWithdrawal(tx) && !isInterest(tx));
  const totalWithdrawals = sumOf(isWithdrawal);
  const interestEarned = sumOf(isInterest);

  if (loading) return <p className="py-6 text-center text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-5 text-white shadow-md sm:p-6">
        <p className="text-sm font-medium text-green-50">Current {label} Balance</p>
        <p className="mt-2 text-3xl font-bold sm:text-5xl">{peso(balance)}</p>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-green-50">Total Deposits</p>
            <p className="text-base font-semibold sm:text-lg">{peso(totalDeposits, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-green-50">Total Withdrawals</p>
            <p className="text-base font-semibold sm:text-lg">{peso(totalWithdrawals, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-green-50">Interest Earned</p>
            <p className="text-base font-semibold sm:text-lg">{peso(interestEarned)}</p>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">{label} Summary</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-gray-700">Total Deposits</p>
            <p className="mt-1 text-xl font-bold text-green-600 sm:text-2xl">{peso(totalDeposits)}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-gray-700">Total Withdrawals</p>
            <p className="mt-1 text-xl font-bold text-red-600 sm:text-2xl">{peso(totalWithdrawals)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-gray-700">Current Balance</p>
            <p className="mt-1 text-xl font-bold text-blue-600 sm:text-2xl">{peso(balance)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent {label} History</h3>
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            {accounts.length ? 'No transactions yet.' : `You have no ${label.toLowerCase()} account yet. Please visit the cooperative office to open one.`}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-800">
                  <th className="py-3 pr-3 font-semibold">Date</th>
                  <th className="py-3 pr-3 font-semibold">Activity</th>
                  <th className="py-3 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((tx) => {
                  const out = isWithdrawal(tx);
                  return (
                    <tr key={tx.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-3 text-gray-800">{fmtDate(tx.transaction_date)}</td>
                      <td className="py-3 pr-3 capitalize text-gray-800">{String(tx.transaction_type).replaceAll('_', ' ')}</td>
                      <td className={`py-3 pr-3 text-right font-medium ${out ? 'text-red-600' : 'text-green-600'}`}>
                        {out ? '' : '+'}{peso(tx.amount, 0)}
                      </td>
                      <td className="py-3 text-right font-semibold text-gray-900">{peso(tx.balance_after, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AccountList;

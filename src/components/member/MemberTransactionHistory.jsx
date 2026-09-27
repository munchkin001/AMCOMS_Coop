import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import EmptyState from '../common/EmptyState';

const MemberTransactionHistory = () => {
  const [filter, setFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get member details
      const { data: memberInfo } = await supabase
        .from('members')
        .select('member_id')
        .eq('user_id', user.id)
        .single();

      if (!memberInfo) return;

      const memberId = memberInfo.member_id;
      const allTransactions = [];

      // Fetch savings transactions
      const { data: savingsTransactions } = await supabase
        .from('savings_transactions')
        .select(`
          *,
          savings_account:savings_accounts(account_number),
          recorded_by_staff:staff(full_name)
        `)
        .eq('savings_accounts.member_id', memberId)
        .order('transaction_date', { ascending: false });

      if (savingsTransactions) {
        savingsTransactions.forEach(txn => {
          allTransactions.push({
            id: `savings-${txn.transaction_id}`,
            date: new Date(txn.transaction_date).toLocaleDateString(),
            type: txn.transaction_type === 'deposit' ? 'Savings Deposit' : 'Savings Withdrawal',
            category: 'Savings',
            amount: txn.transaction_type === 'deposit' ? parseFloat(txn.amount) : -parseFloat(txn.amount),
            badge: `🔷 ${txn.recorded_by_staff?.full_name || 'TREASURER'}`,
            rawDate: txn.transaction_date
          });
        });
      }

      // Fetch loan payments
      const { data: loanPayments } = await supabase
        .from('loan_payments')
        .select(`
          *,
          loan:loans(loan_number, member_id),
          recorded_by_staff:staff(full_name)
        `)
        .eq('loans.member_id', memberId)
        .order('payment_date', { ascending: false });

      if (loanPayments) {
        loanPayments.forEach(payment => {
          allTransactions.push({
            id: `loan-${payment.payment_id}`,
            date: new Date(payment.payment_date).toLocaleDateString(),
            type: 'Loan Payment',
            category: 'Loan',
            amount: -parseFloat(payment.amount_paid),
            badge: `🟣 ${payment.recorded_by_staff?.full_name || 'TREASURER'}`,
            rawDate: payment.payment_date
          });
        });
      }

      // Sort all transactions by date (newest first)
      allTransactions.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchTransactions();
  };

  const filteredTransactions = transactions.filter(t => {
    // Category filter
    if (filter !== 'all' && t.category.toLowerCase() !== filter) {
      return false;
    }

    // Date range filter
    if (dateFrom && new Date(t.rawDate) < new Date(dateFrom)) {
      return false;
    }
    if (dateTo && new Date(t.rawDate) > new Date(dateTo)) {
      return false;
    }

    return true;
  });

  // Calculate summaries
  const moneyReceived = filteredTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const moneyReleased = filteredTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netFlow = moneyReceived - moneyReleased;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <p className="text-sm text-green-700 font-medium mb-1">Money Received</p>
          <p className="text-2xl font-bold text-green-900">
            ₱{moneyReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-sm text-red-700 font-medium mb-1">Money Released</p>
          <p className="text-2xl font-bold text-red-900">
            ₱{moneyReleased.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-sm text-blue-700 font-medium mb-1">Net Flow</p>
          <p className={`text-2xl font-bold ${netFlow >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
            {netFlow >= 0 ? '+' : ''}₱{netFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Transactions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Transactions</option>
              <option value="savings">Savings</option>
              <option value="loan">Loan</option>
              <option value="time deposit">Time Deposit</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={applyFilters}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h3>
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading transactions...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="No Transactions Found"
            description={filter === 'all' 
              ? "You don't have any transactions yet. When cooperative staff processes your savings, loans, or other financial activities, they will appear here."
              : `No ${filter} transactions found. Try selecting a different category or date range.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Category</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{transaction.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{transaction.type}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        {transaction.category}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-sm text-right font-medium ${
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.amount > 0 ? '+' : ''}₱{Math.abs(transaction.amount).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{transaction.badge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-900">View Only</p>
            <p className="text-sm text-amber-700 mt-1">
              This is a view-only record of your financial transactions. You cannot edit or delete completed transactions. All transactions are recorded by cooperative staff with color-coded badges showing who processed them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberTransactionHistory;

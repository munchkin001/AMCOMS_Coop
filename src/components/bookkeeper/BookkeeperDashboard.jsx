import React, { useState, useEffect } from 'react';
import { AlertTriangle, Building2, Clock3, Landmark, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { useTimeOfDayGreeting } from '../../hooks/useTimeOfDayGreeting';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';

const BookkeeperDashboard = ({ onSelectTransaction, onViewBooks }) => {
  const greeting = useTimeOfDayGreeting();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    cashOnHand: 0,
    cashInBank: 0,
    todayReceipts: 0,
    todayDisbursements: 0,
    pendingEntries: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    unpostedTransactions: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, [selectedDate]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [receiptResult, disbursementResult, draftResult, accountRows] = await Promise.all([
        supabase
        .from('cash_receipts')
        .select('id, receipt_date, received_from, description, receipt_number, amount')
        .eq('status', 'recorded').eq('receipt_date', selectedDate)
        .order('created_at', { ascending: false }),
        supabase
        .from('cash_disbursements')
        .select('id, disbursement_date, payee, description, voucher_number, amount')
        .eq('status', 'recorded').eq('disbursement_date', selectedDate)
        .order('created_at', { ascending: false }),
        supabase
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft'),
        fetchAccountBalances()
      ]);

      if (receiptResult.error) throw receiptResult.error;
      if (disbursementResult.error) throw disbursementResult.error;
      if (draftResult.error) throw draftResult.error;

      const receipts = receiptResult.data || [];
      const disbursements = disbursementResult.data || [];
      const balances = summarizeAccountBalances(accountRows);
      const transactions = [
        ...(receipts || []).map(r => ({
          date: r.receipt_date,
          particulars: r.description || r.received_from,
          refNo: r.receipt_number,
          type: 'Cash Receipt',
          amount: parseFloat(r.amount || 0),
          status: 'Recorded'
        })),
        ...(disbursements || []).map(d => ({
          date: d.disbursement_date,
          particulars: d.description || d.payee,
          refNo: d.voucher_number,
          type: 'Cash Disbursement',
          amount: parseFloat(d.amount || 0),
          status: 'Recorded'
        }))
      ].slice(0, 10);

      setRecentTransactions(transactions);
      setDashboardData({
        cashOnHand: balances.cashOnHand,
        cashInBank: balances.cashInBank,
        todayReceipts: receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0),
        todayDisbursements: disbursements.reduce((sum, disbursement) => sum + Number(disbursement.amount || 0), 0),
        pendingEntries: draftResult.count || 0,
        totalAssets: balances.totalAssets,
        totalLiabilities: balances.totalLiabilities,
        totalEquity: balances.totalEquity,
        unpostedTransactions: draftResult.count || 0
      });
      setError('');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(getDataLoadErrorMessage(error, 'bookkeeping data'));
    } finally {
      setLoading(false);
    }
  };

  useMultipleRealtimeSubscriptions([
    'cash_receipts',
    'cash_disbursements',
    'journal_entries',
    'journal_entry_lines',
    'chart_of_accounts'
  ].map((table) => ({ table, onUpdate: fetchDashboardData })), [selectedDate]);

  const todayDate = toDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = toDateString(yesterday);
  const selectedDateLabel = selectedDate === todayDate
    ? 'Today'
    : selectedDate === yesterdayDate
      ? 'Yesterday'
      : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
  const selectedDatePossessive = selectedDateLabel === 'Today'
    ? "Today's"
    : selectedDateLabel === 'Yesterday'
      ? "Yesterday's"
      : selectedDateLabel;

  const summaryCards = [
    { label: 'Cash on Hand', amount: dashboardData.cashOnHand, detail: 'Current recorded balance', icon: Wallet, tone: 'blue' },
    { label: 'Cash in Bank', amount: dashboardData.cashInBank, detail: 'Current recorded balance', icon: Landmark, tone: 'green' },
    { label: `${selectedDatePossessive} Receipts`, amount: dashboardData.todayReceipts, detail: `Total recorded cash receipts for ${selectedDateLabel.toLowerCase()}`, icon: TrendingUp, tone: 'emerald' },
    { label: `${selectedDatePossessive} Disbursements`, amount: dashboardData.todayDisbursements, detail: `Total recorded cash disbursements for ${selectedDateLabel.toLowerCase()}`, icon: TrendingDown, tone: 'red' },
    { label: 'Unposted Entries', amount: dashboardData.unpostedTransactions, detail: 'Journal entries not posted to ledger', icon: Clock3, tone: 'yellow', isCount: true }
  ];

  const accountingCards = [
    { label: 'Total Assets', amount: dashboardData.totalAssets, detail: 'From general ledger', icon: Building2, tone: 'blue' },
    { label: 'Total Liabilities', amount: dashboardData.totalLiabilities, detail: 'From general ledger', icon: Scale, tone: 'red' },
    { label: 'Total Equity', amount: dashboardData.totalEquity, detail: 'From general ledger', icon: Landmark, tone: 'green' }
  ];

  const changeDate = (days) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const current = new Date(year, month - 1, day);
    current.setDate(current.getDate() + days);
    const nextDate = toDateString(current);
    const today = toDateString(new Date());
    setSelectedDate(nextDate > today ? today : nextDate);
  };
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />
      {/* Welcome Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{greeting}, Bookkeeper</h2>
        
        {/* Date Selector */}
        <div className="flex items-center space-x-3 mt-4">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <input
              type="date"
              value={selectedDate}
              max={todayDate}
              onChange={(e) => setSelectedDate(e.target.value > todayDate ? todayDate : e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>
          <button
            onClick={() => setSelectedDate(todayDate)}
            aria-label="Return to today's dashboard"
            title="Return to today"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            {selectedDateLabel}
          </button>
          <button
            onClick={() => changeDate(1)}
            disabled={selectedDate >= todayDate}
            aria-label="Next day"
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard
            key={card.label}
            label={card.label}
            value={card.isCount ? card.amount.toLocaleString() : `₱${card.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            detail={card.detail}
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button
            onClick={() => onSelectTransaction?.()}
            className="flex flex-col items-center justify-center p-4 border-2 border-purple-300 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">New Transaction</span>
          </button>
          <button
            onClick={() => onSelectTransaction?.('other-receipt')}
            className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Other Receipt</span>
          </button>
          <button
            onClick={() => onSelectTransaction?.('other-disbursement')}
            className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-red-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Other Disbursement</span>
          </button>
          <button
            onClick={() => onSelectTransaction?.('sales')}
            className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l2.4 12.4a2 2 0 002 1.6h8.8a2 2 0 002-1.6L22 8H6m4 13a1 1 0 11-2 0 1 1 0 012 0zm10 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Sales Entry</span>
          </button>
          <button
            onClick={() => onViewBooks?.()}
            className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-sm font-medium text-gray-900">View {selectedDatePossessive} Book</span>
          </button>
        </div>
      </div>

      {/* Accounting Balances */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Accounting Equation</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accountingCards.map((card) => (
            <DashboardMetricCard
              key={card.label}
              label={card.label}
              value={`₱${card.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              detail={card.detail}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center">
            <span className="font-semibold">Accounting Equation Check:</span> Assets = Liabilities + Equity
          </p>
          <p className="text-lg font-bold text-center mt-2">
            ₱{dashboardData.totalAssets.toLocaleString('en-PH', { minimumFractionDigits: 2 })} = 
            ₱{dashboardData.totalLiabilities.toLocaleString('en-PH', { minimumFractionDigits: 2 })} + 
            ₱{dashboardData.totalEquity.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <p className={`text-sm text-center mt-2 font-medium ${
            Math.abs(dashboardData.totalAssets - (dashboardData.totalLiabilities + dashboardData.totalEquity)) < 0.01
              ? 'text-green-600' 
              : 'text-red-600'
          }`}>
            {Math.abs(dashboardData.totalAssets - (dashboardData.totalLiabilities + dashboardData.totalEquity)) < 0.01
              ? 'Books are balanced'
              : <><AlertTriangle aria-hidden="true" className="mr-1 inline size-4" />Books are not balanced - please review entries</>}
          </p>
        </div>
      </div>

      {/* Recent Transactions */}
      {(loading || recentTransactions.length > 0) && <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <button 
            onClick={() => alert('Navigate to the Books or Transactions section using the sidebar menu to view detailed transaction records.')}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
          >
            View All Transactions →
          </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Loading transactions...</p>
            </div>
          ) : (
            <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Particulars</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Ref/CV #</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Type</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">Amount</th>
                <th className="text-center py-3 px-6 font-semibold text-gray-700 text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((transaction, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">{transaction.date}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{transaction.particulars}</td>
                  <td className="py-3 px-6 text-sm text-gray-600 font-mono">{transaction.refNo}</td>
                  <td className="py-3 px-6">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      transaction.type === 'Cash Receipt' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-sm text-right font-semibold text-gray-900">
                    ₱{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      transaction.status === 'Recorded' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>}

    </div>
  );
};

export default BookkeeperDashboard;

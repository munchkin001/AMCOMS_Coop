import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const TreasurerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    todayCollections: 0,
    todayDisbursements: 0,
    todayLoanPayments: 0,
    todaySavingsDeposits: 0,
    todaySavingsWithdrawals: 0,
    todayTimeDepositTransactions: 0,
    collectionCount: 0,
    disbursementCount: 0,
    loanPaymentCount: 0,
    savingsDepositCount: 0,
    savingsWithdrawalCount: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Fetch today's cash receipts
      const { data: receiptsData } = await supabase
        .from('cash_receipts')
        .select('amount')
        .eq('receipt_date', today);

      const todayCollections = receiptsData?.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0) || 0;
      const collectionCount = receiptsData?.length || 0;

      // Fetch today's cash disbursements
      const { data: disbursementsData } = await supabase
        .from('cash_disbursements')
        .select('amount')
        .eq('disbursement_date', today);

      const todayDisbursements = disbursementsData?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;
      const disbursementCount = disbursementsData?.length || 0;

      // Fetch today's loan payments
      const { data: loanPaymentsData } = await supabase
        .from('loan_payments')
        .select('amount_paid')
        .eq('payment_date', today);

      const todayLoanPayments = loanPaymentsData?.reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0) || 0;
      const loanPaymentCount = loanPaymentsData?.length || 0;

      // Fetch today's savings transactions
      const { data: savingsData } = await supabase
        .from('savings_transactions')
        .select('transaction_type, amount')
        .eq('transaction_date', today);

      const deposits = savingsData?.filter(t => t.transaction_type === 'deposit') || [];
      const withdrawals = savingsData?.filter(t => t.transaction_type === 'withdrawal') || [];

      const todaySavingsDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const todaySavingsWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

      setDashboardData({
        todayCollections,
        todayDisbursements,
        todayLoanPayments,
        todaySavingsDeposits,
        todaySavingsWithdrawals,
        todayTimeDepositTransactions: 0,
        collectionCount,
        disbursementCount,
        loanPaymentCount,
        savingsDepositCount: deposits.length,
        savingsWithdrawalCount: withdrawals.length
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Today's summary data
  const todaySummary = [
    { label: "Today's Collections", value: loading ? '...' : `₱${dashboardData.todayCollections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '💵', color: 'green', change: `+${dashboardData.collectionCount} transactions` },
    { label: "Today's Disbursements", value: loading ? '...' : `₱${dashboardData.todayDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '💸', color: 'red', change: `+${dashboardData.disbursementCount} transactions` },
    { label: 'Loan Payments', value: loading ? '...' : `₱${dashboardData.todayLoanPayments.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '💰', color: 'blue', change: `+${dashboardData.loanPaymentCount} payments` },
    { label: 'Savings Deposits', value: loading ? '...' : `₱${dashboardData.todaySavingsDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '🏦', color: 'cyan', change: `+${dashboardData.savingsDepositCount} deposits` },
    { label: 'Savings Withdrawals', value: loading ? '...' : `₱${dashboardData.todaySavingsWithdrawals.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '📤', color: 'orange', change: `+${dashboardData.savingsWithdrawalCount} withdrawals` },
    { label: 'Time Deposit Transactions', value: '₱0.00', icon: '💎', color: 'purple', change: '+0 transactions' },
    { label: 'Total Cash Received', value: loading ? '...' : `₱${dashboardData.todayCollections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '📥', color: 'green', change: 'Today' },
    { label: 'Total Cash Released', value: loading ? '...' : `₱${dashboardData.todayDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: '📤', color: 'red', change: 'Today' }
  ];

  // Collection breakdown
  const totalCollections = dashboardData.todayLoanPayments + dashboardData.todaySavingsDeposits;
  const collectionBreakdown = totalCollections > 0 ? [
    { 
      source: 'Loan Payments', 
      amount: dashboardData.todayLoanPayments, 
      percentage: Math.round((dashboardData.todayLoanPayments / totalCollections) * 100) 
    },
    { 
      source: 'Savings Deposits', 
      amount: dashboardData.todaySavingsDeposits, 
      percentage: Math.round((dashboardData.todaySavingsDeposits / totalCollections) * 100) 
    },
    { source: 'Time Deposits', amount: 0, percentage: 0 },
    { source: 'Other Collections', amount: 0, percentage: 0 }
  ] : [];

  // Disbursement breakdown
  const totalDisbursements = dashboardData.todaySavingsWithdrawals;
  const disbursementBreakdown = totalDisbursements > 0 ? [
    { 
      type: 'Savings Withdrawals', 
      amount: dashboardData.todaySavingsWithdrawals, 
      percentage: 100 
    },
    { type: 'Time Deposit Withdrawals', amount: 0, percentage: 0 },
    { type: 'Loan Releases', amount: 0, percentage: 0 }
  ] : [];

  // Recent transactions - will be empty until there's data
  const recentTransactions = [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {todaySummary.map((card, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">{card.label}</p>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">{card.value}</p>
            <p className="text-xs text-gray-500">{card.change}</p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collection Summary */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Collection Summary</h3>
          <div className="space-y-3">
            {collectionBreakdown.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No collections today</p>
              </div>
            ) : (
              collectionBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.source}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-bold text-green-600">₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-500">{item.percentage}%</p>
                  </div>
                </div>
              ))
            )}
            <div className="pt-3 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total Cash Received</span>
                <span className="text-lg font-bold text-green-600">
                  ₱{totalCollections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Disbursement Summary */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Disbursement Summary</h3>
          <div className="space-y-3">
            {disbursementBreakdown.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No disbursements today</p>
              </div>
            ) : (
              disbursementBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.type}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-red-600 h-2 rounded-full" 
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-bold text-red-600">₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-500">{item.percentage}%</p>
                  </div>
                </div>
              ))
            )}
            <div className="pt-3 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total Cash Released</span>
                <span className="text-lg font-bold text-red-600">
                  ₱{totalDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Transaction Summary */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Transaction Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Loan Payments</p>
            <p className="text-2xl font-bold text-blue-600">{dashboardData.loanPaymentCount}</p>
            <p className="text-xs text-gray-500 mt-1">₱{dashboardData.todayLoanPayments.toLocaleString('en-PH', { minimumFractionDigits: 2 })} total</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Savings Deposits</p>
            <p className="text-2xl font-bold text-green-600">{dashboardData.savingsDepositCount}</p>
            <p className="text-xs text-gray-500 mt-1">₱{dashboardData.todaySavingsDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2 })} total</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-gray-600 mb-1">Savings Withdrawals</p>
            <p className="text-2xl font-bold text-orange-600">{dashboardData.savingsWithdrawalCount}</p>
            <p className="text-xs text-gray-500 mt-1">₱{dashboardData.todaySavingsWithdrawals.toLocaleString('en-PH', { minimumFractionDigits: 2 })} total</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-gray-600 mb-1">Time Deposits</p>
            <p className="text-2xl font-bold text-purple-600">0</p>
            <p className="text-xs text-gray-500 mt-1">₱0.00 total</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <button 
            onClick={() => alert('Navigate to Cash Receipts or Cash Disbursements sections using the sidebar menu to view all transactions.')}
            className="text-sm text-teal-600 hover:text-teal-700 font-medium cursor-pointer"
          >
            View All →
          </button>
        </div>
        {loading || recentTransactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="text-sm">No transactions today</p>
            <p className="text-xs mt-1">Transactions will appear here as they are recorded</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((transaction, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-gray-500">{transaction.time}</span>
                    <span className="text-sm font-semibold text-gray-900">{transaction.type}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{transaction.member}</p>
                  <p className="text-xs text-gray-500 mt-1">Ref: {transaction.ref}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">₱{transaction.amount.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Net Cash Flow */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg shadow p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Net Cash Flow (Today)</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-sm text-teal-100 mb-2">Cash Received</p>
            <p className="text-3xl font-bold">₱{dashboardData.todayCollections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-teal-100 mb-2">Cash Released</p>
            <p className="text-3xl font-bold">₱{dashboardData.todayDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-teal-100 mb-2">Net Flow</p>
            <p className={`text-3xl font-bold ${(dashboardData.todayCollections - dashboardData.todayDisbursements) >= 0 ? 'text-yellow-300' : 'text-red-300'}`}>
              {(dashboardData.todayCollections - dashboardData.todayDisbursements) >= 0 ? '+' : ''}₱{(dashboardData.todayCollections - dashboardData.todayDisbursements).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TreasurerDashboard;

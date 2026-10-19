import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { AlertTriangle, Banknote, ClipboardCheck, FileText, Gem, HandCoins, Landmark, Megaphone, Package, UserPlus, Users, Clock3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, fetchMonthlyFinancialSummary, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState({
    pendingRequests: 0,
    activeLoans: 0,
    activeSavings: 0,
    activeTimeDeposits: 0,
    totalMembers: 0,
    lowStockProducts: 0,
    todayLoanApprovals: 0,
    todaySavingsTransactions: 0,
    todayTimeDepositTransactions: 0,
    todayNewMembers: 0,
    todayPendingTransactions: 0,
    totalIncome: 0,
    totalExpenses: 0,
    netIncome: 0,
    cashOnHand: 0,
    monthlyIncome: [],
    monthlyExpenses: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = toDateString(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const [
        pendingRequestsResult,
        activeLoansResult,
        activeSavingsResult,
        activeTimeDepositsResult,
        membersResult,
        stockResult,
        loanApprovalsResult,
        savingsTransactionsResult,
        timeDepositTransactionsResult,
        newMembersResult,
        pendingTransactionsResult,
        accountRows,
        monthlyFinancials
      ] = await Promise.all([
        supabase.from('requests').select('id', { count: 'exact', head: true })
          .eq('request_type', 'loan_application').in('status', ['pending', 'under_review']),
        supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('savings_accounts').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('account_type', 'regular'),
        supabase.from('savings_accounts').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('account_type', 'time_deposit'),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id, reorder_level, stock_inventory(quantity_on_hand)')
          .eq('is_active', true),
        supabase.from('loans').select('id', { count: 'exact', head: true }).eq('approval_date', today),
        supabase.from('savings_transactions').select('id', { count: 'exact', head: true })
          .eq('status', 'recorded').eq('transaction_date', today),
        supabase.from('savings_transactions')
          .select('id, savings_accounts!inner(account_type)')
          .eq('status', 'recorded').eq('transaction_date', today).eq('savings_accounts.account_type', 'time_deposit'),
        supabase.from('members').select('id', { count: 'exact', head: true })
          .gte('date_joined', today).lt('date_joined', toDateString(tomorrow)),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true })
          .eq('status', 'draft').eq('entry_date', today),
        fetchAccountBalances(),
        fetchMonthlyFinancialSummary()
      ]);

      const results = [
        pendingRequestsResult, activeLoansResult, activeSavingsResult, activeTimeDepositsResult,
        membersResult, stockResult, loanApprovalsResult, savingsTransactionsResult,
        timeDepositTransactionsResult, newMembersResult, pendingTransactionsResult
      ];
      const failedResult = results.find((result) => result.error);
      if (failedResult) throw failedResult.error;

      const lowStockProducts = (stockResult.data || []).filter((product) =>
        (product.stock_inventory?.[0]?.quantity_on_hand ?? 0) <= product.reorder_level
      ).length;
      const financialSummary = summarizeAccountBalances(accountRows);

      setDashboardData({
        pendingRequests: pendingRequestsResult.count || 0,
        activeLoans: activeLoansResult.count || 0,
        activeSavings: activeSavingsResult.count || 0,
        activeTimeDeposits: activeTimeDepositsResult.count || 0,
        totalMembers: membersResult.count || 0,
        lowStockProducts,
        todayLoanApprovals: loanApprovalsResult.count || 0,
        todaySavingsTransactions: savingsTransactionsResult.count || 0,
        todayTimeDepositTransactions: timeDepositTransactionsResult.data?.length || 0,
        todayNewMembers: newMembersResult.count || 0,
        todayPendingTransactions: pendingTransactionsResult.count || 0,
        totalIncome: financialSummary.totalIncome,
        totalExpenses: financialSummary.totalExpenses,
        netIncome: financialSummary.totalIncome - financialSummary.totalExpenses,
        cashOnHand: financialSummary.cashOnHand,
        monthlyIncome: monthlyFinancials.income,
        monthlyExpenses: monthlyFinancials.expenses
      });
      setError('');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(getDataLoadErrorMessage(error, 'management data'));
    } finally {
      setLoading(false);
    }
  };

  useMultipleRealtimeSubscriptions([
    'loans',
    'requests',
    'loan_payments',
    'savings_accounts',
    'savings_transactions',
    'members',
    'products',
    'journal_entries',
    'journal_entry_lines',
    'chart_of_accounts'
  ].map((table) => ({ table, onUpdate: fetchDashboardData })), []);

  // Summary cards data
  const summaryCards = [
    { label: 'Pending Requests', value: loading ? '...' : dashboardData.pendingRequests.toString(), icon: Clock3, tone: 'yellow', detail: 'Loan requests' },
    { label: 'Active Loans', value: loading ? '...' : dashboardData.activeLoans.toString(), icon: HandCoins, tone: 'blue', detail: 'Being serviced' },
    { label: 'Active Savings', value: loading ? '...' : dashboardData.activeSavings.toString(), icon: Landmark, tone: 'green', detail: 'Regular accounts' },
    { label: 'Active Time Deposits', value: loading ? '...' : dashboardData.activeTimeDeposits.toString(), icon: Gem, tone: 'purple', detail: 'Time deposits' },
    { label: 'Total Members', value: loading ? '...' : dashboardData.totalMembers.toString(), icon: Users, tone: 'cyan', detail: 'Cooperative members' },
    { label: 'Inventory Status', value: loading ? '...' : (dashboardData.lowStockProducts > 0 ? 'Alert' : 'Good'), icon: Package, tone: dashboardData.lowStockProducts > 0 ? 'yellow' : 'green', detail: `${dashboardData.lowStockProducts} low stock` }
  ];

  // Financial data for chart
  const getMonthLabels = () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonth = new Date().getMonth();
    const labels = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      labels.push(months[monthIndex]);
    }
    return labels;
  };

  const financialData = {
    labels: getMonthLabels(),
    datasets: [
      {
        label: 'Income',
        data: dashboardData.monthlyIncome,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: dashboardData.monthlyExpenses,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '₱' + value.toLocaleString();
          }
        }
      }
    }
  };

  // Today's activities
  const todayActivities = [
    { type: 'Loan Approved', count: dashboardData.todayLoanApprovals, icon: ClipboardCheck, color: 'text-green-600' },
    { type: 'Savings Transactions', count: dashboardData.todaySavingsTransactions, icon: Banknote, color: 'text-blue-600' },
    { type: 'Time Deposit Transactions', count: dashboardData.todayTimeDepositTransactions, icon: Gem, color: 'text-purple-600' },
    { type: 'New Members', count: dashboardData.todayNewMembers, icon: UserPlus, color: 'text-cyan-600' },
    { type: 'Low Stock Products', count: dashboardData.lowStockProducts, icon: AlertTriangle, color: 'text-yellow-600' },
    { type: 'Pending Transactions', count: dashboardData.todayPendingTransactions, icon: Clock3, color: 'text-orange-600' }
  ];

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} icon={card.icon} tone={card.tone} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Overview - Takes 2 columns */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Overview</h3>
          <div style={{ height: '300px' }}>
            <Line data={financialData} options={chartOptions} />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total Income</p>
              <p className="text-lg font-bold text-green-600">
                ₱{dashboardData.totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-lg font-bold text-red-600">
                ₱{dashboardData.totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Net Income</p>
              <p className="text-lg font-bold text-blue-600">
                ₱{dashboardData.netIncome.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cash on Hand</p>
              <p className="text-lg font-bold text-purple-600">
                ₱{dashboardData.cashOnHand.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Today's Activities */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Activities</h3>
          <div className="space-y-4">
            {todayActivities.map((activity, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center space-x-3">
                  <activity.icon aria-hidden="true" className={`size-5 shrink-0 ${activity.color}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.type}</p>
                    <p className="text-xs text-gray-500">Today</p>
                  </div>
                </div>
                <span className={`text-xl font-bold ${activity.color}`}>{loading ? '...' : activity.count}</span>
              </div>
            ))}
          </div>
          <button 
            onClick={() => alert('Navigate to the Activities section using the sidebar menu to view all activities.')}
            className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
          >
            View All Activities
          </button>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Requests */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Pending Requests</h3>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full">
              {dashboardData.pendingRequests} Pending
            </span>
          </div>
          {loading || dashboardData.pendingRequests === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No pending requests</p>
              <p className="text-xs mt-1">All loan requests have been processed</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Loan requests awaiting approval will appear here</p>
            </div>
          )}
          <button 
            onClick={() => navigate('/staff/loan-requests')}
            className="w-full mt-4 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium cursor-pointer"
          >
            View All Requests
          </button>
        </div>

        {/* Alerts & Reminders */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Alerts & Reminders</h3>
          <div className="space-y-3">
            {dashboardData.lowStockProducts > 0 && (
              <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Low Stock Alert</p>
                  <p className="text-xs text-red-700">{dashboardData.lowStockProducts} products are running low on stock</p>
                </div>
              </div>
            )}
            {!loading && dashboardData.lowStockProducts === 0 && dashboardData.pendingRequests === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No alerts at this time</p>
                <p className="text-xs mt-1">System is running smoothly</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => navigate('/staff/loan-requests')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <ClipboardCheck aria-hidden="true" className="mx-auto mb-2 size-7" />
            <span className="text-sm font-medium">Review Requests</span>
          </button>
          <button 
            onClick={() => alert('Feature Coming Soon!\n\nTo add a new member, please use the Members section from the sidebar menu or contact the cooperative office.\n\nContact: +63 XXX XXX XXXX')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <UserPlus aria-hidden="true" className="mx-auto mb-2 size-7" />
            <span className="text-sm font-medium">Add Member</span>
          </button>
          <button 
            onClick={() => alert('Navigate to the Reports section using the sidebar menu to generate various management reports.')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <FileText aria-hidden="true" className="mx-auto mb-2 size-7" />
            <span className="text-sm font-medium">Generate Report</span>
          </button>
          <button 
            onClick={() => alert('Feature Coming Soon!\n\nAnnouncement system will be available in a future update. For now, please contact members directly or post announcements at the cooperative office.')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <Megaphone aria-hidden="true" className="mx-auto mb-2 size-7" />
            <span className="text-sm font-medium">Send Announcement</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;

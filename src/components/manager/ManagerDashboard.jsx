import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { supabase } from '../../lib/supabase';

const ManagerDashboard = () => {
  const [loading, setLoading] = useState(true);
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
    todayPendingTransactions: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Fetch pending loan requests
      const { count: pendingRequests } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Fetch active loans
      const { count: activeLoans } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Fetch active savings accounts
      const { count: activeSavings } = await supabase
        .from('savings_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('account_type', 'regular');

      // Fetch active time deposits
      const { count: activeTimeDeposits } = await supabase
        .from('savings_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('account_type', 'time_deposit');

      // Fetch total members
      const { count: totalMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });

      // Fetch low stock products
      const { data: lowStockData } = await supabase
        .from('products')
        .select('id, reorder_level, stock_inventory(quantity_on_hand)')
        .eq('is_active', true);

      const lowStockProducts = lowStockData?.filter(p => 
        p.stock_inventory?.[0]?.quantity_on_hand <= p.reorder_level
      ).length || 0;

      // Today's activities
      const { count: todayLoanApprovals } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('approval_date', today);

      const { count: todaySavingsTransactions } = await supabase
        .from('savings_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_date', today);

      const { count: todayNewMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      setDashboardData({
        pendingRequests: pendingRequests || 0,
        activeLoans: activeLoans || 0,
        activeSavings: activeSavings || 0,
        activeTimeDeposits: activeTimeDeposits || 0,
        totalMembers: totalMembers || 0,
        lowStockProducts,
        todayLoanApprovals: todayLoanApprovals || 0,
        todaySavingsTransactions: todaySavingsTransactions || 0,
        todayTimeDepositTransactions: 0, // Will calculate when you have time deposit transactions
        todayNewMembers: todayNewMembers || 0,
        todayPendingTransactions: 0 // Will calculate from pending transactions
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Summary cards data
  const summaryCards = [
    { label: 'Pending Requests', value: loading ? '...' : dashboardData.pendingRequests.toString(), icon: '⏳', color: 'yellow', change: 'Loan requests' },
    { label: 'Active Loans', value: loading ? '...' : dashboardData.activeLoans.toString(), icon: '💰', color: 'blue', change: 'Being serviced' },
    { label: 'Active Savings', value: loading ? '...' : dashboardData.activeSavings.toString(), icon: '🏦', color: 'green', change: 'Regular accounts' },
    { label: 'Active Time Deposits', value: loading ? '...' : dashboardData.activeTimeDeposits.toString(), icon: '💎', color: 'purple', change: 'Time deposits' },
    { label: 'Total Members', value: loading ? '...' : dashboardData.totalMembers.toString(), icon: '👥', color: 'cyan', change: 'Cooperative members' },
    { label: 'Inventory Status', value: loading ? '...' : (dashboardData.lowStockProducts > 0 ? 'Alert' : 'Good'), icon: '📦', color: dashboardData.lowStockProducts > 0 ? 'yellow' : 'green', change: `${dashboardData.lowStockProducts} low stock` }
  ];

  // Financial data for chart
  const financialData = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [
      {
        label: 'Income',
        data: [0, 0, 0, 0, 0, 0],
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: [0, 0, 0, 0, 0, 0],
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
    { type: 'Loan Approved', count: dashboardData.todayLoanApprovals, icon: '✅', color: 'text-green-600' },
    { type: 'Savings Transactions', count: dashboardData.todaySavingsTransactions, icon: '💵', color: 'text-blue-600' },
    { type: 'Time Deposit Transactions', count: dashboardData.todayTimeDepositTransactions, icon: '💎', color: 'text-purple-600' },
    { type: 'New Members', count: dashboardData.todayNewMembers, icon: '👤', color: 'text-cyan-600' },
    { type: 'Low Stock Products', count: dashboardData.lowStockProducts, icon: '⚠️', color: 'text-yellow-600' },
    { type: 'Pending Transactions', count: dashboardData.todayPendingTransactions, icon: '⏰', color: 'text-orange-600' }
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">{card.label}</p>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{card.value}</p>
            <p className="text-xs text-gray-500">{card.change}</p>
          </div>
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
              <p className="text-lg font-bold text-green-600">₱0.00</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-lg font-bold text-red-600">₱0.00</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Net Income</p>
              <p className="text-lg font-bold text-blue-600">₱0.00</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cash on Hand</p>
              <p className="text-lg font-bold text-purple-600">₱0.00</p>
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
                  <span className="text-xl">{activity.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.type}</p>
                    <p className="text-xs text-gray-500">Today</p>
                  </div>
                </div>
                <span className={`text-xl font-bold ${activity.color}`}>{activity.count}</span>
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
            onClick={() => alert('Navigate to the Requests or Loans section using the sidebar menu to view all pending requests.')}
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
                <span className="text-red-600 text-xl">🚨</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Low Stock Alert</p>
                  <p className="text-xs text-red-700">{dashboardData.lowStockProducts} products are running low on stock</p>
                </div>
              </div>
            )}
            <div className="flex items-start space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600 text-xl">✅</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900">System Status</p>
                <p className="text-xs text-green-700">All systems operating normally</p>
              </div>
            </div>
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
            onClick={() => alert('Navigate to the Loans section using the sidebar menu to review pending loan applications.')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <span className="text-3xl mb-2 block">📝</span>
            <span className="text-sm font-medium">Review Requests</span>
          </button>
          <button 
            onClick={() => alert('Feature Coming Soon!\n\nTo add a new member, please use the Members section from the sidebar menu or contact the cooperative office.\n\nContact: +63 XXX XXX XXXX')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <span className="text-3xl mb-2 block">👥</span>
            <span className="text-sm font-medium">Add Member</span>
          </button>
          <button 
            onClick={() => alert('Navigate to the Reports section using the sidebar menu to generate various management reports.')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <span className="text-3xl mb-2 block">📊</span>
            <span className="text-sm font-medium">Generate Report</span>
          </button>
          <button 
            onClick={() => alert('Feature Coming Soon!\n\nAnnouncement system will be available in a future update. For now, please contact members directly or post announcements at the cooperative office.')}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg p-4 transition-all text-center cursor-pointer"
          >
            <span className="text-3xl mb-2 block">📢</span>
            <span className="text-sm font-medium">Send Announcement</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;

import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Banknote, HandCoins, Landmark, PiggyBank, TrendingDown, TrendingUp, UserCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ChairmanDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalMembers: 0,
    activeMembers: 0,
    activeLoans: 0,
    totalLoanBalance: 0,
    totalSavings: 0,
    totalTimeDeposits: 0,
    paidLoans: 0,
    overdueLoans: 0,
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalProduction: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Set up real-time subscriptions for live updates
  useMultipleRealtimeSubscriptions([
    {
      table: 'members',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'loans',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'loan_payments',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'savings_accounts',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'products',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'stock_inventory',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'production_records',
      onUpdate: () => fetchDashboardData()
    }
  ], []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch total and active members
      const { count: totalMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });

      const { count: activeMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('membership_status', 'active');

      // Fetch active loans count and total balance
      const { data: activeLoansData } = await supabase
        .from('loans')
        .select('balance')
        .eq('status', 'active');

      const activeLoans = activeLoansData?.length || 0;
      const totalLoanBalance = activeLoansData?.reduce((sum, loan) => sum + parseFloat(loan.balance || 0), 0) || 0;

      // Fetch paid loans count
      const { count: paidLoans } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      // Fetch overdue loans (simplified - you can add date logic later)
      const { count: overdueLoans } = await supabase
        .from('loans')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lt('maturity_date', new Date().toISOString());

      // Fetch total savings
      const { data: savingsData } = await supabase
        .from('savings_accounts')
        .select('balance')
        .eq('status', 'active');

      const totalSavings = savingsData?.reduce((sum, account) => sum + parseFloat(account.balance || 0), 0) || 0;

      // Separate time deposits from regular savings
      const { data: timeDepositsData } = await supabase
        .from('savings_accounts')
        .select('balance')
        .eq('account_type', 'time_deposit')
        .eq('status', 'active');

      const totalTimeDeposits = timeDepositsData?.reduce((sum, account) => sum + parseFloat(account.balance || 0), 0) || 0;

      // Fetch inventory data
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: stockData } = await supabase
        .from('stock_inventory')
        .select('quantity_on_hand, product:products!inner(reorder_level, is_active)')
        .eq('product.is_active', true);

      let lowStockCount = 0;
      let outOfStockCount = 0;

      stockData?.forEach(item => {
        const qty = item.quantity_on_hand || 0;
        const reorderLevel = item.product?.reorder_level || 10;
        
        if (qty === 0) {
          outOfStockCount++;
        } else if (qty <= reorderLevel) {
          lowStockCount++;
        }
      });

      // Fetch production for current month
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: productionData } = await supabase
        .from('production_records')
        .select('quantity_produced')
        .eq('status', 'completed')
        .gte('production_date', firstDayOfMonth);

      const totalProduction = productionData?.reduce((sum, record) => sum + (record.quantity_produced || 0), 0) || 0;

      setDashboardData({
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        activeLoans,
        totalLoanBalance,
        totalSavings,
        totalTimeDeposits,
        paidLoans: paidLoans || 0,
        overdueLoans: overdueLoans || 0,
        totalProducts: totalProducts || 0,
        lowStockCount,
        outOfStockCount,
        totalProduction
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const summaryCards = [
    { label: 'Total Members', value: loading ? '...' : dashboardData.totalMembers.toString(), icon: Users, tone: 'blue' },
    { label: 'Active Members', value: loading ? '...' : dashboardData.activeMembers.toString(), icon: UserCheck, tone: 'green' },
    { label: 'Active Loans', value: loading ? '...' : dashboardData.activeLoans.toString(), icon: HandCoins, tone: 'yellow' },
    { label: 'Total Loan Balance', value: loading ? '...' : `₱${dashboardData.totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Banknote, tone: 'purple' },
    { label: 'Total Savings', value: loading ? '...' : `₱${dashboardData.totalSavings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: PiggyBank, tone: 'cyan' },
    { label: 'Total Time Deposits', value: loading ? '...' : `₱${dashboardData.totalTimeDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Landmark, tone: 'indigo' },
    { label: 'Current Income', value: '₱0.00', icon: TrendingUp, tone: 'green' },
    { label: 'Current Expenses', value: '₱0.00', icon: TrendingDown, tone: 'red' }
  ];

  const financialData = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [
      {
        label: 'Income',
        data: [0, 0, 0, 0, 0, 0], // Will be populated from journal entries
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: [0, 0, 0, 0, 0, 0], // Will be populated from journal entries
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
      legend: {
        position: 'top',
      },
      title: {
        display: false
      }
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

  const recentPolicies = [
    // Will be populated from database when policies module is implemented
  ];

  return (
    <div className="space-y-6">
      <DiscrepancyPanel />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
        ))}
      </div>

      {/* Financial Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenses Chart */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Overview</h3>
          <div style={{ height: '300px' }}>
            <Line data={financialData} options={chartOptions} />
          </div>
          <div className="mt-4 flex items-center justify-center space-x-8">
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Income</p>
              <p className="text-xl font-bold text-green-600">₱0.00</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-xl font-bold text-red-600">₱0.00</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Net Income</p>
              <p className="text-xl font-bold text-blue-600">₱0.00</p>
            </div>
          </div>
        </div>

        {/* Loan Summary */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Loan Summary</h3>
          {loading ? (
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-sm text-gray-600">Active Loans</span>
                <span className="font-semibold text-gray-900">{dashboardData.activeLoans}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-sm text-gray-600">Paid Loans</span>
                <span className="font-semibold text-green-600">{dashboardData.paidLoans}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-sm text-gray-600">Overdue Loans</span>
                <span className="font-semibold text-red-600">{dashboardData.overdueLoans}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Outstanding Balance</span>
                <span className="font-semibold text-gray-900">
                  ₱{dashboardData.totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member Summary */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Member Summary</h3>
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Members</span>
                <span className="font-semibold text-gray-900">{dashboardData.totalMembers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Active Members</span>
                <span className="font-semibold text-green-600">{dashboardData.activeMembers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">New Members (This Month)</span>
                <span className="font-semibold text-blue-600">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Savings</span>
                <span className="font-semibold text-gray-900">
                  ₱{dashboardData.totalSavings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Summary</h3>
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Available Products</span>
                <span className="font-semibold text-gray-900">{dashboardData.totalProducts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Low Stock Items</span>
                <span className="font-semibold text-yellow-600">{dashboardData.lowStockCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Out of Stock</span>
                <span className="font-semibold text-red-600">{dashboardData.outOfStockCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Production (This Month)</span>
                <span className="font-semibold text-green-600">{dashboardData.totalProduction} units</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Year-to-Year Comparison & Recent Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Year-to-Year Comparison */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Year-to-Year Comparison</h3>
          <div className="text-center py-8 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">Year-to-year comparison data will appear here</p>
            <p className="text-xs mt-1">Add historical data to see trends</p>
          </div>
        </div>

        {/* Recent Policies */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Policies</h3>
            <button 
              onClick={() => alert('Navigate to the Policies section using the sidebar menu to view all policies.')}
              className="text-sm text-green-600 hover:text-green-700 font-medium cursor-pointer"
            >
              View All →
            </button>
          </div>
          {recentPolicies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No policies published yet</p>
              <p className="text-xs mt-1">Create policies in the Policies module</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPolicies.map((policy, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                  <p className="text-sm font-medium text-gray-900">{policy.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Published: {policy.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChairmanDashboard;

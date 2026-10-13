import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Banknote, HandCoins, Landmark, PiggyBank, TrendingDown, TrendingUp, UserCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DashboardMetricCard from '../common/DashboardMetricCard';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, fetchMonthlyFinancialSummary, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [financialSummary, setFinancialSummary] = useState({
    labels: [],
    income: [],
    expenses: [],
    currentIncome: 0,
    currentExpenses: 0
  });
  const [newMembersThisMonth, setNewMembersThisMonth] = useState(0);
  const [yearlyFinancialSummary, setYearlyFinancialSummary] = useState({
    currentYear: new Date().getFullYear(),
    previousYear: new Date().getFullYear() - 1,
    currentIncome: 0,
    previousIncome: 0,
    currentExpenses: 0,
    previousExpenses: 0
  });
  const [recentPolicies, setRecentPolicies] = useState([]);
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
    },
    {
      table: 'journal_entries',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'journal_entry_lines',
      onUpdate: () => fetchDashboardData()
    },
    {
      table: 'chart_of_accounts',
      onUpdate: () => fetchDashboardData()
    }
  ], []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = toDateString(new Date());
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartDate = toDateString(monthStart);
      const previousYearDate = new Date(new Date().getFullYear() - 1, new Date().getMonth(), new Date().getDate());

      const [
        membersResult,
        activeMembersResult,
        activeLoansResult,
        paidLoansResult,
        overdueLoansResult,
        savingsResult,
        timeDepositsResult,
        productsResult,
        stockResult,
        productionResult,
        newMembersResult,
        monthlySummary,
        currentYearAccounts,
        previousYearAccounts
      ] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('membership_status', 'active'),
        supabase.from('loans').select('balance').eq('status', 'active'),
        supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('loans').select('id', { count: 'exact', head: true })
          .eq('status', 'active').lt('maturity_date', today),
        supabase.from('savings_accounts').select('balance, account_type')
          .eq('status', 'active'),
        supabase.from('savings_accounts').select('balance')
          .eq('account_type', 'time_deposit').eq('status', 'active'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('stock_inventory')
          .select('quantity_on_hand, product:products!inner(reorder_level, is_active)')
          .eq('product.is_active', true),
        supabase.from('production_records').select('quantity_produced')
          .eq('status', 'completed').gte('production_date', monthStartDate),
        supabase.from('members').select('id', { count: 'exact', head: true })
          .gte('date_joined', monthStartDate).lte('date_joined', today),
        fetchMonthlyFinancialSummary(),
        fetchAccountBalances(`${new Date().getFullYear()}-01-01`, today),
        fetchAccountBalances(`${new Date().getFullYear() - 1}-01-01`, toDateString(previousYearDate))
      ]);

      const results = [
        membersResult, activeMembersResult, activeLoansResult, paidLoansResult, overdueLoansResult,
        savingsResult, timeDepositsResult, productsResult, stockResult, productionResult,
        newMembersResult
      ];
      const failedResult = results.find((result) => result.error);
      if (failedResult) throw failedResult.error;

      // Fetch policies separately - optional feature, don't fail if table doesn't exist
      let policyResult = { data: [], error: null };
      try {
        policyResult = await supabase.from('policies').select('id, name, published_at')
          .eq('status', 'published').order('published_at', { ascending: false }).limit(5);
      } catch (policyError) {
        console.warn('Policies table not available:', policyError);
      }

      const activeLoans = activeLoansResult.data || [];
      const totalLoanBalance = activeLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
      const totalSavings = (savingsResult.data || [])
        .filter((account) => account.account_type !== 'time_deposit')
        .reduce((sum, account) => sum + Number(account.balance || 0), 0);
      const totalTimeDeposits = (timeDepositsResult.data || []).reduce((sum, account) => sum + Number(account.balance || 0), 0);

      let lowStockCount = 0;
      let outOfStockCount = 0;

      stockResult.data?.forEach(item => {
        const qty = item.quantity_on_hand || 0;
        const reorderLevel = item.product?.reorder_level || 0;
        
        if (qty === 0) {
          outOfStockCount++;
        } else if (qty <= reorderLevel) {
          lowStockCount++;
        }
      });

      const totalProduction = (productionResult.data || [])
        .reduce((sum, record) => sum + Number(record.quantity_produced || 0), 0);

      setDashboardData({
        totalMembers: membersResult.count || 0,
        activeMembers: activeMembersResult.count || 0,
        activeLoans: activeLoans.length,
        totalLoanBalance,
        totalSavings,
        totalTimeDeposits,
        paidLoans: paidLoansResult.count || 0,
        overdueLoans: overdueLoansResult.count || 0,
        totalProducts: productsResult.count || 0,
        lowStockCount,
        outOfStockCount,
        totalProduction
      });
      setFinancialSummary(monthlySummary);
      setNewMembersThisMonth(newMembersResult.count || 0);
      const currentYearTotals = summarizeAccountBalances(currentYearAccounts);
      const previousYearTotals = summarizeAccountBalances(previousYearAccounts);
      setYearlyFinancialSummary({
        currentYear: new Date().getFullYear(),
        previousYear: new Date().getFullYear() - 1,
        currentIncome: currentYearTotals.periodIncome,
        previousIncome: previousYearTotals.periodIncome,
        currentExpenses: currentYearTotals.periodExpenses,
        previousExpenses: previousYearTotals.periodExpenses
      });
      setRecentPolicies(policyResult.data || []);
      setError('');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(`Unable to load chairman data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const summaryCards = [
    { label: 'Total Members', value: loading ? '...' : dashboardData.totalMembers.toString(), icon: Users, tone: 'blue', path: '/staff/members' },
    { label: 'Active Members', value: loading ? '...' : dashboardData.activeMembers.toString(), icon: UserCheck, tone: 'green', path: '/staff/members' },
    { label: 'Active Loans', value: loading ? '...' : dashboardData.activeLoans.toString(), icon: HandCoins, tone: 'yellow', path: '/staff/savings' },
    { label: 'Total Loan Balance', value: loading ? '...' : `₱${dashboardData.totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Banknote, tone: 'purple', path: '/staff/savings' },
    { label: 'Total Savings', value: loading ? '...' : `₱${dashboardData.totalSavings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: PiggyBank, tone: 'cyan', path: '/staff/savings' },
    { label: 'Total Time Deposits', value: loading ? '...' : `₱${dashboardData.totalTimeDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Landmark, tone: 'indigo', path: '/staff/savings' },
    { label: 'Current Income', value: loading ? '...' : `₱${financialSummary.currentIncome.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, tone: 'green', path: '/staff/general-ledger' },
    { label: 'Current Expenses', value: loading ? '...' : `₱${financialSummary.currentExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingDown, tone: 'red', path: '/staff/general-ledger' }
  ];

  const financialData = {
    labels: financialSummary.labels,
    datasets: [
      {
        label: 'Income',
        data: financialSummary.income,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: financialSummary.expenses,
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

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <DashboardMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            onClick={() => navigate(card.path)}
          />
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
              <p className="text-xl font-bold text-green-600">₱{financialSummary.currentIncome.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-xl font-bold text-red-600">₱{financialSummary.currentExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Net Income</p>
              <p className="text-xl font-bold text-blue-600">₱{(financialSummary.currentIncome - financialSummary.currentExpenses).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                <span className="font-semibold text-blue-600">{newMembersThisMonth}</span>
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
          <p className="mb-4 text-xs text-gray-500">Year to date through {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</p>
          <div className="space-y-4">
            {[
              { label: 'Income', current: yearlyFinancialSummary.currentIncome, previous: yearlyFinancialSummary.previousIncome, color: 'text-green-600' },
              { label: 'Expenses', current: yearlyFinancialSummary.currentExpenses, previous: yearlyFinancialSummary.previousExpenses, color: 'text-red-600' }
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-gray-50 p-4">
                <p className="mb-2 text-sm font-semibold text-gray-800">{item.label}</p>
                <div className="flex justify-between text-sm">
                  <span>{yearlyFinancialSummary.currentYear}</span>
                  <span className={`font-semibold ${item.color}`}>₱{item.current.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span>{yearlyFinancialSummary.previousYear}</span>
                  <span className="font-medium text-gray-700">₱{item.previous.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
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
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading policies...</p>
          ) : recentPolicies.length === 0 ? (
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
                  <p className="text-xs text-gray-500 mt-1">Published: {new Date(policy.published_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
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

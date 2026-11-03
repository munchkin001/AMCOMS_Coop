import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { FileText, HandCoins, Package, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, fetchMonthlyFinancialSummary, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
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

  const fetchRecentPolicies = useCallback(async () => {
    const { data, error: policyError } = await supabase
      .from('policies')
      .select('id, name, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5);

    if (policyError) {
      console.error('Unable to refresh recent policies:', policyError);
      return;
    }
    setRecentPolicies(data || []);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchRecentPolicies();
  }, [fetchRecentPolicies]);

  // Set up real-time subscriptions for live updates
  useMultipleRealtimeSubscriptions([
    {
      table: 'policies',
      onUpdate: () => fetchRecentPolicies()
    },
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
      setError('');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(getDataLoadErrorMessage(error, 'dashboard data'));
    } finally {
      setLoading(false);
    }
  };

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
    <div className="space-y-6 rounded-2xl p-3 sm:p-5">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2e68] via-[#1454a5] to-[#3180d8] p-6 text-white shadow-xl shadow-blue-900/20 sm:p-8">
        <div aria-hidden="true" className="absolute -right-10 -top-20 size-64 rounded-full border-[28px] border-white/15" />
        <div aria-hidden="true" className="absolute -bottom-24 right-1/3 size-48 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Executive overview</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Cooperative at a glance</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Monitor financial performance, member activity, lending, and operations from one place.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/staff/performance')}
            className="min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-800"
          >
            View performance report
          </button>
        </div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <DiscrepancyPanel />
      {/* Financial Overview */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        {/* Income vs Expenses Chart */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <TrendingUp aria-hidden="true" size={20} />
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">Financial Overview</h3>
                <p className="text-xs text-slate-500">Income and expenses over the last six months</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">6-month view</span>
          </div>
          <div className="px-4 pt-4 sm:px-6">
            <div className="h-64 sm:h-72">
              <Line data={financialData} options={chartOptions} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-3 sm:px-6">
            <div className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-100">
              <p className="text-xs font-medium text-slate-500">Total Income</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-emerald-700">₱{financialSummary.currentIncome.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-100">
              <p className="text-xs font-medium text-slate-500">Total Expenses</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-rose-600">₱{financialSummary.currentExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-100">
              <p className="text-xs font-medium text-slate-500">Net Income</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-blue-700">₱{(financialSummary.currentIncome - financialSummary.currentExpenses).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        {/* Loan Summary */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <HandCoins aria-hidden="true" size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Loan Summary</h3>
              <p className="text-xs text-slate-500">Portfolio status at a glance</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-4 p-5 sm:p-6">
              <div className="h-20 rounded-xl bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-lg bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-lg bg-slate-100 animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 p-4 text-white">
                <p className="text-xs font-medium text-blue-100">Outstanding Balance</p>
                <p className="mt-2 break-words text-2xl font-bold tabular-nums">₱{dashboardData.totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-xs text-slate-500">Active</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{dashboardData.activeLoans}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-xs text-emerald-700">Paid</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{dashboardData.paidLoans}</p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3 text-center">
                  <p className="text-xs text-rose-700">Overdue</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-rose-700">{dashboardData.overdueLoans}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Member Summary */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Users aria-hidden="true" size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Member Summary</h3>
              <p className="text-xs text-slate-500">Membership and savings snapshot</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3 p-5 sm:p-6">
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Total Members</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{dashboardData.totalMembers}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">Active Members</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{dashboardData.activeMembers}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-medium text-blue-700">New This Month</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-blue-700">{newMembersThisMonth}</p>
              </div>
              <div className="rounded-xl bg-violet-50 p-4">
                <p className="text-xs font-medium text-violet-700">Total Savings</p>
                <p className="mt-2 break-words text-xl font-bold tabular-nums text-violet-800">₱{dashboardData.totalSavings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Package aria-hidden="true" size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Inventory Summary</h3>
              <p className="text-xs text-slate-500">Stock and production snapshot</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3 p-5 sm:p-6">
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
              <div className="h-12 rounded-xl bg-slate-100 animate-pulse"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Available Products</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{dashboardData.totalProducts}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-xs font-medium text-amber-700">Low Stock Items</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-amber-700">{dashboardData.lowStockCount}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-4">
                <p className="text-xs font-medium text-rose-700">Out of Stock</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-rose-700">{dashboardData.outOfStockCount}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">Production This Month</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{dashboardData.totalProduction} <span className="text-sm font-semibold">units</span></p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Year-to-Year Comparison & Recent Policies */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Year-to-Year Comparison */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-700">
              <TrendingDown aria-hidden="true" size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Year-to-Year Comparison</h3>
              <p className="text-xs text-slate-500">Current year compared with last year</p>
            </div>
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            {[
              { label: 'Income', current: yearlyFinancialSummary.currentIncome, previous: yearlyFinancialSummary.previousIncome, color: 'text-green-600' },
              { label: 'Expenses', current: yearlyFinancialSummary.currentExpenses, previous: yearlyFinancialSummary.previousExpenses, color: 'text-red-600' }
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <span className="text-xs text-slate-500">{yearlyFinancialSummary.currentYear} vs {yearlyFinancialSummary.previousYear}</span>
                </div>
                {[
                  { year: yearlyFinancialSummary.currentYear, value: item.current, color: item.label === 'Income' ? 'bg-emerald-500' : 'bg-rose-500', text: item.color },
                  { year: yearlyFinancialSummary.previousYear, value: item.previous, color: 'bg-slate-400', text: 'text-slate-700' }
                ].map((period) => (
                  <div key={period.year} className="mt-3">
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="text-slate-600">{period.year}</span>
                      <span className={`font-semibold tabular-nums ${period.text}`}>₱{period.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${period.color}`} style={{ width: `${Math.min(100, Math.max(period.value > 0 ? 2 : 0, period.value / Math.max(item.current, item.previous, 1) * 100))}%` }} />
                    </div>
                  </div>
                ))}
                </div>
            ))}
          </div>
        </div>

        {/* Recent Policies */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                <FileText aria-hidden="true" size={20} />
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">Recent Policies</h3>
                <p className="text-xs text-slate-500">Latest published cooperative policies</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/staff/policies')}
              className="rounded-md text-sm font-semibold text-green-700 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              View all
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
            </div>
          ) : (
            <div className="space-y-3 p-5 sm:p-6">
              {recentPolicies.map((policy) => (
                <div key={policy.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:bg-slate-100">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-cyan-700 shadow-sm">
                    <FileText aria-hidden="true" size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{policy.name}</p>
                    <p className="mt-1 text-xs text-slate-500">Published {new Date(policy.published_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                  </div>
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

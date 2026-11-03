import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import ReportInsights from '../common/ReportInsights';
import MemberReportSort from '../common/MemberReportSort';
import { sortMemberReportRows } from '../common/memberReportSorting';

const getPeriodRange = (period) => {
  const [yearText, periodType] = period.split('-');
  const year = Number(yearText);
  const start = periodType === 'Full'
    ? new Date(year, 0, 1)
    : new Date(year, (Number(periodType.slice(1)) - 1) * 3, 1);
  const end = periodType === 'Full'
    ? new Date(year, 11, 31)
    : new Date(year, Number(periodType.slice(1)) * 3, 0);

  return {
    start: toDateString(start),
    end: toDateString(end),
    label: periodType === 'Full'
      ? `Full Year ${year}`
      : `Q${periodType.slice(1)} ${year} (${start.toLocaleDateString('en-US', { month: 'short' })} - ${end.toLocaleDateString('en-US', { month: 'short' })})`
  };
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const PerformanceReport = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const periods = Array.from({ length: 6 }, (_, index) => currentYear - index)
    .flatMap((year) => [
      ...[1, 2, 3, 4].map((quarter) => ({ value: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` })),
      { value: `${year}-Full`, label: `Full Year ${year}` }
    ]);
  const [reportPeriod, setReportPeriod] = useState(`${currentYear}-Q${currentQuarter}`);
  const [reportType, setReportType] = useState('comprehensive');
  const [memberSort, setMemberSort] = useState('newest');
  const [showPreview, setShowPreview] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const loading = reportData === null && !error;
  const requestId = useRef(0);
  const range = useMemo(() => getPeriodRange(reportPeriod), [reportPeriod]);

  const loadReport = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const today = toDateString(new Date());
      const [
        periodAccounts,
        currentAccounts,
        receiptsResult,
        disbursementsResult,
        membersResult,
        savingsResult,
        loansResult,
        paymentsResult,
        productsResult,
        productionResult,
        movementsResult
      ] = await Promise.all([
        fetchAccountBalances(range.start, range.end),
        fetchAccountBalances(),
        supabase.from('cash_receipts').select('amount')
          .eq('status', 'recorded').gte('receipt_date', range.start).lte('receipt_date', range.end),
        supabase.from('cash_disbursements').select('amount')
          .gte('disbursement_date', range.start).lte('disbursement_date', range.end),
        supabase.from('members')
          .select('id, member_number, first_name, middle_name, last_name, membership_status, membership_type, date_joined, total_capital')
          .order('date_joined', { ascending: false, nullsFirst: false }),
        supabase.from('savings_accounts').select('balance, account_type').eq('status', 'active'),
        supabase.from('loans').select('principal_amount, balance, status, maturity_date'),
        supabase.from('loan_payments').select('amount_paid')
          .eq('status', 'recorded').gte('payment_date', range.start).lte('payment_date', range.end),
        supabase.from('products').select('reorder_level, stock_inventory(quantity_available)').eq('is_active', true),
        supabase.from('production_records').select('quantity_produced, products(product_name, unit_of_measure)')
          .eq('status', 'completed').gte('production_date', range.start).lte('production_date', range.end),
        supabase.from('stock_movements')
          .select('movement_type, quantity, products(product_name, unit_of_measure)')
          .gte('movement_date', range.start).lte('movement_date', range.end)
      ]);

      const results = [
        receiptsResult, disbursementsResult, membersResult, savingsResult, loansResult,
        paymentsResult, productsResult, productionResult, movementsResult
      ];
      const failedResult = results.find((result) => result.error);
      if (failedResult) throw failedResult.error;

      const members = membersResult.data || [];
      const savingsAccounts = savingsResult.data || [];
      const activeLoans = (loansResult.data || []).filter((loan) => loan.status === 'active');
      const products = productsResult.data || [];
      const periodIncomeAccounts = (periodAccounts || [])
        .filter((account) => account.account_type === 'revenue')
        .map((account) => ({
          label: account.account_name,
          amount: Number(account.period_credit || 0) - Number(account.period_debit || 0)
        }))
        .filter((account) => account.amount !== 0)
        .sort((a, b) => b.amount - a.amount);
      const periodExpenseAccounts = (periodAccounts || [])
        .filter((account) => account.account_type === 'expense')
        .map((account) => ({
          label: account.account_name,
          amount: Number(account.period_debit || 0) - Number(account.period_credit || 0)
        }))
        .filter((account) => account.amount !== 0)
        .sort((a, b) => b.amount - a.amount);
      const movementGroups = (movementsResult.data || []).reduce((groups, movement) => {
        const unit = movement.products?.unit_of_measure || 'unit not specified';
        const key = `${movement.movement_type} · ${unit}`;
        groups[key] = (groups[key] || 0) + Number(movement.quantity || 0);
        return groups;
      }, {});
      const productionByProduct = (productionResult.data || []).reduce((groups, record) => {
        const product = record.products?.product_name || 'Unspecified product';
        const unit = record.products?.unit_of_measure || 'unit not specified';
        const key = `${product} · ${unit}`;
        groups[key] = (groups[key] || 0) + Number(record.quantity_produced || 0);
        return groups;
      }, {});
      const countInventory = products.reduce((counts, product) => {
        const quantity = product.stock_inventory?.[0]?.quantity_available || 0;
        if (quantity === 0) counts.outOfStock += 1;
        else if (quantity <= (product.reorder_level || 0)) counts.lowStock += 1;
        else counts.available += 1;
        return counts;
      }, { available: 0, lowStock: 0, outOfStock: 0 });
      const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
      const financial = summarizeAccountBalances(periodAccounts);
      const currentFinancial = summarizeAccountBalances(currentAccounts);

      if (currentRequest !== requestId.current) return;
      setReportData({
        financial: {
          income: financial.periodIncome,
          expenses: financial.periodExpenses,
          netIncome: financial.periodIncome - financial.periodExpenses,
          incomeAccounts: periodIncomeAccounts,
          expenseAccounts: periodExpenseAccounts,
          cashReceived: sum(receiptsResult.data || [], 'amount'),
          cashReleased: sum(disbursementsResult.data || [], 'amount'),
          cashOnHand: currentFinancial.cashOnHand
        },
        members: {
          total: members.length,
          active: members.filter((member) => member.membership_status === 'active').length,
          records: members,
          newInPeriod: members.filter((member) =>
            member.date_joined && member.date_joined >= range.start && member.date_joined <= range.end
          ).length,
          savings: savingsAccounts.filter((account) => account.account_type !== 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0),
          timeDeposits: savingsAccounts.filter((account) => account.account_type === 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0),
          shareCapital: sum(members, 'total_capital'),
          inactive: members.filter((member) => member.membership_status !== 'active').length,
          activeRate: members.length ? members.filter((member) => member.membership_status === 'active').length / members.length * 100 : 0
        },
        loans: {
          activeCount: activeLoans.length,
          principal: sum(activeLoans, 'principal_amount'),
          payments: sum(paymentsResult.data || [], 'amount_paid'),
          paymentCount: (paymentsResult.data || []).length,
          overdueCount: activeLoans.filter((loan) => loan.maturity_date && loan.maturity_date < today).length,
          balance: sum(activeLoans, 'balance')
        },
        inventory: {
          totalProducts: products.length,
          ...countInventory,
          production: sum(productionResult.data || [], 'quantity_produced'),
          productionBatches: (productionResult.data || []).length,
          productsSold: sum((movementsResult.data || []).filter((row) => row.movement_type === 'sale'), 'quantity'),
          waste: sum((movementsResult.data || []).filter((row) => row.movement_type === 'waste'), 'quantity'),
          movementGroups: Object.entries(movementGroups)
            .map(([label, quantity]) => ({ label, quantity }))
            .sort((a, b) => a.label.localeCompare(b.label)),
          productionByProduct: Object.entries(productionByProduct)
            .map(([label, quantity]) => ({ label, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
        }
      });
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load performance report:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'report data'));
    }
  }, [range]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!selectedMember) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedMember(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedMember]);

  useMultipleRealtimeSubscriptions([
    'cash_receipts', 'cash_disbursements', 'journal_entries', 'journal_entry_lines',
    'chart_of_accounts', 'members', 'savings_accounts', 'loans', 'loan_payments',
    'products', 'stock_inventory', 'production_records', 'stock_movements'
  ].map((table) => ({ table, onUpdate: loadReport })), [loadReport]);

  const metric = (label, value, color = 'text-gray-900') => (
    <div className="flex justify-between gap-4 border-b border-gray-200 py-2 last:border-0">
      <span className="text-gray-700">{label}</span>
      <span className={`font-semibold text-right ${color}`}>{value}</span>
    </div>
  );

  const handleGenerateReport = () => {
    setShowPreview(true);
    setReportData(null);
    setError('');
    loadReport();
  };

  const sortedMembers = useMemo(() => (
    reportData?.members?.records
      ? sortMemberReportRows(reportData.members.records, memberSort)
      : []
  ), [memberSort, reportData]);

  const analysis = useMemo(() => {
    if (!reportData) return null;
    const financial = reportData.financial;
    const members = reportData.members;
    const loans = reportData.loans;
    const inventory = reportData.inventory;
    const isFinancial = reportType === 'financial';
    const isOperations = reportType === 'operations';
    const metrics = [];
    const highlights = [];
    const challenges = [];
    const opportunities = [];
    const breakdowns = [];

    if (!isOperations) {
      metrics.push(
        { label: 'Period income', value: formatMoney(financial.income) },
        { label: 'Period expenses', value: formatMoney(financial.expenses) },
        { label: 'Net operating result', value: formatMoney(financial.netIncome), detail: financial.netIncome < 0 ? 'Deficit for the selected period' : 'Surplus for the selected period' },
        { label: 'Cash received / released', value: `${formatMoney(financial.cashReceived)} / ${formatMoney(financial.cashReleased)}` }
      );
      if (financial.netIncome < 0) challenges.push(`Recorded expenses exceeded income by ${formatMoney(Math.abs(financial.netIncome))} during this period.`);
      else if (financial.netIncome > 0) highlights.push(`Recorded income exceeded expenses by ${formatMoney(financial.netIncome)} during this period.`);
      highlights.push(`Recorded cash movement: ${formatMoney(financial.cashReceived)} received and ${formatMoney(financial.cashReleased)} released.`);
      breakdowns.push(
        {
          title: 'Income by account',
          valueHeading: 'Period amount',
          items: financial.incomeAccounts.map((account) => ({ label: account.label, value: formatMoney(account.amount) }))
        },
        {
          title: 'Expenses by account',
          valueHeading: 'Period amount',
          items: financial.expenseAccounts.map((account) => ({ label: account.label, value: formatMoney(account.amount) }))
        }
      );
    }

    if (!isFinancial) {
      metrics.push(
        { label: 'Members', value: members.total.toLocaleString(), detail: `${members.active.toLocaleString()} active · ${members.inactive.toLocaleString()} non-active` },
        { label: 'New members', value: members.newInPeriod.toLocaleString(), detail: 'Joined during this report period' },
        { label: 'Active loans', value: loans.activeCount.toLocaleString(), detail: `${formatMoney(loans.balance)} outstanding balance` },
        { label: 'Production / sales', value: `${inventory.production.toLocaleString()} / ${inventory.productsSold.toLocaleString()}`, detail: 'Recorded quantities; product units may differ' },
        { label: 'Inventory requiring attention', value: `${(inventory.lowStock + inventory.outOfStock).toLocaleString()} products`, detail: `${inventory.lowStock} low · ${inventory.outOfStock} out of stock` }
      );
      if (members.newInPeriod > 0) highlights.push(`${members.newInPeriod.toLocaleString()} new member${members.newInPeriod === 1 ? '' : 's'} joined during the selected period.`);
      highlights.push(`${members.activeRate.toFixed(1)}% of recorded members currently have active status.`);
      if (loans.overdueCount > 0) challenges.push(`${loans.overdueCount.toLocaleString()} active loan${loans.overdueCount === 1 ? '' : 's'} have passed their recorded maturity date; review payment schedules and follow-up.`);
      if (inventory.outOfStock > 0) challenges.push(`${inventory.outOfStock.toLocaleString()} active product${inventory.outOfStock === 1 ? '' : 's'} currently show no available stock.`);
      if (inventory.lowStock > 0) opportunities.push(`Review reorder needs for ${inventory.lowStock.toLocaleString()} low-stock product${inventory.lowStock === 1 ? '' : 's'}.`);
      if (inventory.productionBatches > 0) opportunities.push(`Review production output by product to identify seasonal demand and replenishment needs.`);
      breakdowns.push(
        {
          title: 'Membership and member funds',
          valueHeading: 'Members / balance',
          items: [
            { label: 'Active members', value: members.active.toLocaleString() },
            { label: 'Non-active members', value: members.inactive.toLocaleString() },
            { label: 'Regular savings', value: formatMoney(members.savings) },
            { label: 'Time deposits', value: formatMoney(members.timeDeposits) },
            { label: 'Share capital', value: formatMoney(members.shareCapital) }
          ]
        },
        {
          title: 'Agricultural production and stock movement',
          valueHeading: 'Recorded quantity',
          detailHeading: 'Basis',
          items: [
            ...inventory.productionByProduct.map((row) => ({ label: `Production · ${row.label}`, value: row.quantity.toLocaleString(), detail: 'Production records in period' })),
            ...inventory.movementGroups.map((row) => ({ label: `Movement · ${row.label}`, value: row.quantity.toLocaleString(), detail: 'Stock movement records in period' }))
          ]
        }
      );
    }

    if (financial.netIncome === 0 && !isOperations) challenges.push('Income and expenses are equal for this period; review the account-level breakdown for context.');
    if (loans.payments > 0 && !isFinancial) highlights.push(`${loans.paymentCount.toLocaleString()} recorded loan payment${loans.paymentCount === 1 ? '' : 's'} totaling ${formatMoney(loans.payments)}.`);
    return {
      metrics,
      highlights,
      challenges,
      opportunities,
      breakdowns,
      scopeNote: !isFinancial
        ? 'Agricultural output and stock movements are shown as recorded quantities grouped by product and unit. AMCOMS does not currently record farm area, crop cycle, yield per area, weather, or input-use data in these report sources, so yield and farm-productivity ratios are not calculated.'
        : null
    };
  }, [reportData, reportType]);

  return (
    <div className="space-y-6">
      <header className="no-print relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2e68] via-[#1454a5] to-[#3180d8] p-6 text-white shadow-xl shadow-blue-900/20 sm:p-8">
        <div aria-hidden="true" className="absolute -right-10 -top-20 size-64 rounded-full border-[28px] border-white/15" />
        <div aria-hidden="true" className="absolute -bottom-24 right-1/3 size-48 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Executive insights</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Performance report</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Review financial health, member growth, lending, and operational outcomes for a selected period.</p>
        </div>
      </header>
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Configure report</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Report Period
            <select
              value={reportPeriod}
              onChange={(event) => {
                setReportData(null);
                setError('');
                setReportPeriod(event.target.value);
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              {periods.map((period) => (
                <option key={period.value} value={period.value}>{period.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Report Type
            <select
              value={reportType}
              onChange={(event) => setReportType(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="comprehensive">Comprehensive Report</option>
              <option value="financial">Financial Summary Only</option>
              <option value="operations">Operations Summary Only</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              handleGenerateReport();
            }}
            className="rounded-lg bg-blue-800 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            Generate Report
          </button>
          {showPreview && (
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-blue-100 px-6 py-2 font-medium text-blue-900 hover:bg-blue-200"
            >
              Print
            </button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="amcoms-print-document rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" id="report-content">
          <header className="amcoms-document-header mb-8 border-b-4 pb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Performance Report</h1>
            <p className="mt-2 text-sm text-gray-700">Period covered: {range.label}</p>
            <p className="mt-2 text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
          </header>

          {loading && <p className="py-4 text-center text-gray-600">Loading live report data…</p>}
          {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
          {!loading && !error && reportData && (
            <div className="space-y-8">
              {(reportType === 'comprehensive' || reportType === 'financial') && (
                <section>
                  <h2 className="mb-4 border-b border-gray-300 pb-2 text-xl font-bold">Financial Summary</h2>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      {metric('Total Income', formatMoney(reportData.financial.income))}
                      {metric('Total Expenses', formatMoney(reportData.financial.expenses))}
                      {metric('Net Income', formatMoney(reportData.financial.netIncome), 'text-green-700')}
                    </div>
                    <div>
                      {metric('Cash Received', formatMoney(reportData.financial.cashReceived))}
                      {metric('Cash Released', formatMoney(reportData.financial.cashReleased))}
                      {metric('Cash on Hand', formatMoney(reportData.financial.cashOnHand), 'text-blue-700')}
                    </div>
                  </div>
                </section>
              )}

              {(reportType === 'comprehensive' || reportType === 'operations') && (
                <>
                  <section>
                    <h2 className="mb-4 border-b border-gray-300 pb-2 text-xl font-bold">Member Summary</h2>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        {metric('Total Members', reportData.members.total.toLocaleString())}
                        {metric('Active Members', reportData.members.active.toLocaleString())}
                        {metric('New Members in Period', reportData.members.newInPeriod.toLocaleString(), 'text-green-700')}
                      </div>
                      <div>
                        {metric('Total Savings', formatMoney(reportData.members.savings))}
                        {metric('Total Time Deposits', formatMoney(reportData.members.timeDeposits))}
                        {metric('Total Share Capital', formatMoney(reportData.members.shareCapital))}
                      </div>
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-gray-300 pb-2">
                      <div>
                        <h2 className="text-xl font-bold">Member Register</h2>
                        <p className="mt-1 text-sm text-gray-600">Choose a sort order. Newest members are shown first by default.</p>
                      </div>
                      <MemberReportSort value={memberSort} onChange={setMemberSort} id="chairman-member-report-sort" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                          <tr>
                            <th className="whitespace-nowrap px-3 py-2">Member ID</th>
                            <th className="px-3 py-2">Member name</th>
                            <th className="whitespace-nowrap px-3 py-2">Date joined</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedMembers.map((member) => (
                            <tr key={member.id} className="border-t border-slate-200 odd:bg-white even:bg-slate-50">
                              <td className="whitespace-nowrap px-3 py-2 font-medium">
                                {member.member_number ? (
                                  <button type="button" onClick={() => setSelectedMember(member)} className="rounded text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
                                    {member.member_number}
                                  </button>
                                ) : <span className="text-slate-500">—</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-800">{[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ') || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{member.date_joined ? new Date(`${member.date_joined}T00:00:00`).toLocaleDateString('en-PH') : '—'}</td>
                              <td className="px-3 py-2 capitalize text-slate-700">{member.membership_type || '—'}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-2">
                                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${member.membership_status === 'active' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
                                    {member.membership_status || 'Unknown'}
                                  </span>
                                  {member.date_joined && member.date_joined >= range.start && member.date_joined <= range.end && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">New</span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {sortedMembers.length === 0 && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No member records found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h2 className="mb-4 border-b border-gray-300 pb-2 text-xl font-bold">Loan Summary</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-blue-50 p-4">
                        <p className="text-sm text-gray-600">Active Loans</p>
                        <p className="text-2xl font-bold text-blue-700">{reportData.loans.activeCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 p-4">
                        <p className="text-sm text-gray-600">Active Principal</p>
                        <p className="text-xl font-bold text-green-700">{formatMoney(reportData.loans.principal)}</p>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-4">
                        <p className="text-sm text-gray-600">Payments in Period</p>
                        <p className="text-xl font-bold text-purple-700">{formatMoney(reportData.loans.payments)}</p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-4">
                        <p className="text-sm text-gray-600">Past Maturity</p>
                        <p className="text-2xl font-bold text-red-700">{reportData.loans.overdueCount.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded bg-gray-50 px-4">
                      {metric('Remaining Active Loan Balance', formatMoney(reportData.loans.balance))}
                    </div>
                  </section>

                  <section>
                    <h2 className="mb-4 border-b border-gray-300 pb-2 text-xl font-bold">Inventory Summary</h2>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        {metric('Active Products', reportData.inventory.totalProducts.toLocaleString())}
                        {metric('Available Stock', reportData.inventory.available.toLocaleString(), 'text-green-700')}
                        {metric('Low Stock Items', reportData.inventory.lowStock.toLocaleString(), 'text-yellow-700')}
                        {metric('Out-of-Stock Items', reportData.inventory.outOfStock.toLocaleString(), 'text-red-700')}
                      </div>
                      <div>
                        {metric('Production in Period', reportData.inventory.production.toLocaleString())}
                        {metric('Products Sold in Period', reportData.inventory.productsSold.toLocaleString())}
                      </div>
                    </div>
                  </section>
                </>
              )}
              {analysis && <ReportInsights {...analysis} />}
            </div>
          )}
          <footer className="document-signatures mt-12 grid grid-cols-2 gap-8">
            <div className="mt-16 border-t-2 border-gray-300 pt-2 text-center">
              <p className="font-semibold text-gray-900">Chairman</p>
              <p className="text-sm text-gray-600">AMCOMS</p>
            </div>
            <div className="mt-16 border-t-2 border-gray-300 pt-2 text-center">
              <p className="font-semibold text-gray-900">Date</p>
            </div>
          </footer>
        </div>
      )}
      {selectedMember && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="performance-member-details-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#0b2e68] via-[#1454a5] to-[#3180d8] px-5 py-5 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Member details</p>
                <h2 id="performance-member-details-title" className="mt-1 text-xl font-bold">
                  {[selectedMember.first_name, selectedMember.middle_name, selectedMember.last_name].filter(Boolean).join(' ') || 'Member'}
                </h2>
                <p className="mt-1 text-sm text-blue-100">Member ID {selectedMember.member_number}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} aria-label="Close member details" className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                Close
              </button>
            </header>
            <dl className="grid gap-3 p-5 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">Membership type</dt>
                <dd className="mt-1 capitalize font-medium text-slate-900">{selectedMember.membership_type || '—'}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
                <dd className="mt-1 capitalize font-medium text-slate-900">{selectedMember.membership_status || 'Unknown'}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase text-slate-500">Date joined</dt>
                <dd className="mt-1 font-medium text-slate-900">{selectedMember.date_joined ? new Date(`${selectedMember.date_joined}T00:00:00`).toLocaleDateString('en-PH') : '—'}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
};

export default PerformanceReport;

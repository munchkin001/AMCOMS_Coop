import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, summarizeAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

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
  const [showPreview, setShowPreview] = useState(false);
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
        supabase.from('members').select('membership_status, date_joined, total_capital'),
        supabase.from('savings_accounts').select('balance, account_type').eq('status', 'active'),
        supabase.from('loans').select('principal_amount, balance, status, maturity_date'),
        supabase.from('loan_payments').select('amount_paid')
          .eq('status', 'recorded').gte('payment_date', range.start).lte('payment_date', range.end),
        supabase.from('products').select('reorder_level, stock_inventory(quantity_available)').eq('is_active', true),
        supabase.from('production_records').select('quantity_produced')
          .eq('status', 'completed').gte('production_date', range.start).lte('production_date', range.end),
        supabase.from('stock_movements').select('quantity')
          .eq('movement_type', 'sale').gte('movement_date', range.start).lte('movement_date', range.end)
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
          cashReceived: sum(receiptsResult.data || [], 'amount'),
          cashReleased: sum(disbursementsResult.data || [], 'amount'),
          cashOnHand: currentFinancial.cashOnHand
        },
        members: {
          total: members.length,
          active: members.filter((member) => member.membership_status === 'active').length,
          newInPeriod: members.filter((member) =>
            member.date_joined && member.date_joined >= range.start && member.date_joined <= range.end
          ).length,
          savings: savingsAccounts.filter((account) => account.account_type !== 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0),
          timeDeposits: savingsAccounts.filter((account) => account.account_type === 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0),
          shareCapital: sum(members, 'total_capital')
        },
        loans: {
          activeCount: activeLoans.length,
          principal: sum(activeLoans, 'principal_amount'),
          payments: sum(paymentsResult.data || [], 'amount_paid'),
          overdueCount: activeLoans.filter((loan) => loan.maturity_date && loan.maturity_date < today).length,
          balance: sum(activeLoans, 'balance')
        },
        inventory: {
          totalProducts: products.length,
          ...countInventory,
          production: sum(productionResult.data || [], 'quantity_produced'),
          productsSold: sum(movementsResult.data || [], 'quantity')
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

  return (
    <div className="space-y-6">
      <div className="no-print rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Report Configuration</h3>
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
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
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
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
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
            className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white hover:bg-green-700"
          >
            Generate Report
          </button>
          {showPreview && (
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              Print
            </button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="amcoms-print-document rounded-lg border border-gray-200 bg-white p-8 shadow" id="report-content">
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
    </div>
  );
};

export default PerformanceReport;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import ReportInsights from '../common/ReportInsights';

const currentMonth = new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const csvCell = (value) => {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

const getDateRange = (period, selectedDate) => {
  if (period === 'daily') return { from: selectedDate, to: selectedDate };
  const [year, month] = selectedDate.split('-').map(Number);
  if (period === 'annual') return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === 'quarterly') {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const lastMonth = firstMonth + 2;
    return {
      from: `${year}-${String(firstMonth).padStart(2, '0')}-01`,
      to: new Date(Date.UTC(year, lastMonth, 0)).toISOString().slice(0, 10),
    };
  }
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
};

const FinancialReports = () => {
  const [reportType, setReportType] = useState('financial-summary');
  const [period, setPeriod] = useState('monthly');
  const [selectedDate, setSelectedDate] = useState(currentMonth);
  const [showPreview, setShowPreview] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const range = useMemo(() => getDateRange(period, selectedDate), [period, selectedDate]);
  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    setSelectedDate((current) => {
      if (nextPeriod === 'daily') return current.length === 10 ? current : today();
      return current.slice(0, 7);
    });
    if (showPreview) {
      setLoading(true);
      setError('');
      setRows([]);
    }
  };
  const handleDateChange = (nextDate) => {
    if (!nextDate) return;
    setSelectedDate(nextDate);
    if (showPreview) {
      setLoading(true);
      setError('');
      setRows([]);
    }
  };
  const refreshReport = useCallback(() => {
    if (!showPreview) return;
    setLoading(true);
    setError('');
    setRows([]);
    setRequestVersion((version) => version + 1);
  }, [showPreview]);

  useMultipleRealtimeSubscriptions([
    { table: 'journal_entries', onUpdate: refreshReport },
    { table: 'journal_entry_lines', onUpdate: refreshReport },
  ], [refreshReport]);

  useEffect(() => {
    if (!showPreview) return undefined;
    let active = true;
    supabase.rpc('get_account_balances', { p_from: range.from, p_to: range.to })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError) {
          setError(getDataLoadErrorMessage(rpcError, 'financial report'));
          setRows([]);
        } else {
          setRows(data || []);
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(getDataLoadErrorMessage(loadError, 'financial report'));
        setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [range.from, range.to, requestVersion, showPreview]);

  const report = useMemo(() => {
    const income = rows
      .filter((row) => row.account_type === 'revenue')
      .map((row) => ({ ...row, amount: Number(row.period_credit) - Number(row.period_debit) }))
      .filter((row) => row.amount !== 0);
    const expenses = rows
      .filter((row) => row.account_type === 'expense')
      .map((row) => ({ ...row, amount: Number(row.period_debit) - Number(row.period_credit) }))
      .filter((row) => row.amount !== 0);
    const cashAccounts = rows
      .filter((row) => row.account_type === 'asset'
        && /cash|bank/i.test(row.account_name))
      .map((row) => ({
        ...row,
        received: Number(row.period_debit),
        released: Number(row.period_credit),
        closing: Number(row.closing_balance),
      }))
      .filter((row) => row.received || row.released || row.closing);
    const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
    return {
      income,
      expenses,
      cashAccounts,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      cashReceived: cashAccounts.reduce((sum, row) => sum + row.received, 0),
      cashReleased: cashAccounts.reduce((sum, row) => sum + row.released, 0),
      cashBalance: cashAccounts.reduce((sum, row) => sum + row.closing, 0),
    };
  }, [rows]);

  const reportTitle = {
    'financial-summary': 'Financial Summary',
    'income-report': 'Income Report',
    'expense-report': 'Expense Report',
    'cash-summary': 'Cash Summary',
  }[reportType];

  const downloadReport = () => {
    const sections = reportType === 'income-report'
      ? [['Income account', 'Amount'], ...report.income.map((row) => [row.account_name, row.amount])]
      : reportType === 'expense-report'
        ? [['Expense account', 'Amount'], ...report.expenses.map((row) => [row.account_name, row.amount])]
        : reportType === 'cash-summary'
          ? [['Cash account', 'Received', 'Released', 'Ending balance'],
            ...report.cashAccounts.map((row) => [row.account_name, row.received, row.released, row.closing])]
          : [['Category', 'Amount'],
            ...report.income.map((row) => [`Income: ${row.account_name}`, row.amount]),
            ...report.expenses.map((row) => [`Expense: ${row.account_name}`, row.amount]),
            ['Net income', report.netIncome]];
    const csv = [
      ['AMCOMS', reportTitle, `${range.from} to ${range.to}`],
      ...sections,
    ].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `amcoms-${reportType}-${range.from}-to-${range.to}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const breakdown = reportType === 'income-report' ? report.income
    : reportType === 'expense-report' ? report.expenses
      : [];

  const analysis = useMemo(() => {
    const metrics = reportType === 'income-report'
      ? [
        { label: 'Total income', value: `₱${money(report.totalIncome)}` },
        { label: 'Income accounts with activity', value: report.income.length.toLocaleString() }
      ]
      : reportType === 'expense-report'
        ? [
          { label: 'Total expenses', value: `₱${money(report.totalExpenses)}` },
          { label: 'Expense accounts with activity', value: report.expenses.length.toLocaleString() }
        ]
        : reportType === 'cash-summary'
          ? [
            { label: 'Cash received', value: `₱${money(report.cashReceived)}` },
            { label: 'Cash released', value: `₱${money(report.cashReleased)}` },
            { label: 'Ending cash / bank balance', value: `₱${money(report.cashBalance)}` },
            { label: 'Accounts with activity', value: report.cashAccounts.length.toLocaleString() }
          ]
          : [
            { label: 'Total income', value: `₱${money(report.totalIncome)}` },
            { label: 'Total expenses', value: `₱${money(report.totalExpenses)}` },
            { label: 'Net result', value: `₱${money(Math.abs(report.netIncome))}`, detail: report.netIncome < 0 ? 'Deficit' : 'Surplus' },
            { label: 'Net cash flow', value: `₱${money(report.cashReceived - report.cashReleased)}` }
          ];
    const highlights = [];
    const challenges = [];
    const opportunities = [];
    const categories = [];
    if (reportType === 'financial-summary' || reportType === 'income-report') {
      categories.push({
        title: 'Income breakdown by chart-of-account category',
        valueHeading: 'Period amount',
        items: report.income.map((row) => ({ label: row.account_name, value: `₱${money(row.amount)}` }))
      });
    }
    if (reportType === 'financial-summary' || reportType === 'expense-report') {
      categories.push({
        title: 'Expense breakdown by chart-of-account category',
        valueHeading: 'Period amount',
        items: report.expenses.map((row) => ({ label: row.account_name, value: `₱${money(row.amount)}` }))
      });
    }
    if (reportType === 'cash-summary') {
      categories.push({
        title: 'Cash and bank movement by account',
        labelHeading: 'Cash / bank account',
        valueHeading: 'Received',
        detailHeading: 'Released · ending balance',
        items: report.cashAccounts.map((row) => ({
          label: row.account_name,
          value: `₱${money(row.received)}`,
          detail: `₱${money(row.released)} released · ₱${money(row.closing)} ending`
        }))
      });
    }
    if (report.netIncome > 0) highlights.push(`The period closed with a net surplus of ₱${money(report.netIncome)}.`);
    if (report.totalIncome > 0) highlights.push(`Income was recorded across ${report.income.length.toLocaleString()} chart-of-account categories.`);
    if (report.netIncome < 0) challenges.push(`Expenses exceeded income by ₱${money(Math.abs(report.netIncome))}; review the largest expense categories.`);
    if (report.totalIncome === 0 && report.totalExpenses === 0) challenges.push('No income or expense activity is present in the selected period.');
    if (report.expenses.length > 0) opportunities.push('Review the account-level expense breakdown to identify items requiring budget follow-up.');
    if (report.cashAccounts.length > 0) opportunities.push('Use the cash and bank account detail to reconcile recorded receipts and releases to statements and physical counts.');
    return { metrics, highlights, challenges, opportunities, breakdowns: categories };
  }, [report, reportType]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-700">Bookkeeping · Reporting</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">Report Configuration</h3>
          <p className="mt-1 text-sm text-gray-600">Choose a financial report and reporting period to review posted accounting activity.</p>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Report Type
            <select value={reportType} onChange={(event) => setReportType(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="financial-summary">Financial Summary</option>
              <option value="income-report">Income Report</option>
              <option value="expense-report">Expense Report</option>
              <option value="cash-summary">Cash Summary</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Period
            <select value={period} onChange={(event) => handlePeriodChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            {period === 'daily' ? 'Select Date' : 'Select Month'}
            <input
              type={period === 'daily' ? 'date' : 'month'}
              value={selectedDate}
              max={period === 'daily' ? today() : currentMonth}
                onChange={(event) => handleDateChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <button type="button" onClick={() => {
          setLoading(true);
          setError('');
          setRows([]);
          setShowPreview(true);
          setRequestVersion((version) => version + 1);
        }} className="w-full rounded-xl bg-gradient-to-r from-purple-950 to-purple-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:from-purple-900 hover:to-purple-600">
          Generate Report
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {showPreview && !error && (
        <section className="amcoms-print-document rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <header className="amcoms-document-header mb-6 border-b-4 border-purple-900 pb-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">{reportTitle}</h1>
            <p className="mt-2 text-sm text-gray-700">Period covered: {range.from} to {range.to}</p>
            <p className="mt-1 text-xs text-gray-500">Generated {new Date().toLocaleString('en-PH')}</p>
          </header>
          {!loading && <ReportInsights {...analysis} />}
          {loading ? <p className="py-8 text-center text-sm text-gray-500">Loading posted accounting data...</p> : (
            <>
              {reportType === 'financial-summary' && (
                <div className="grid gap-6 md:grid-cols-2">
                  <ReportRows title="Income" rows={report.income} total={report.totalIncome} color="green" />
                  <ReportRows title="Expenses" rows={report.expenses} total={report.totalExpenses} color="red" />
                  <p className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-lg font-bold text-purple-950 md:col-span-2">
                    Net {report.netIncome < 0 ? 'deficit' : 'surplus'}: ₱{money(Math.abs(report.netIncome))}
                  </p>
                </div>
              )}
              {(reportType === 'income-report' || reportType === 'expense-report') && (
                <ReportRows title={reportTitle} rows={breakdown} total={breakdown.reduce((sum, row) => sum + row.amount, 0)} color={reportType === 'income-report' ? 'green' : 'red'} />
              )}
              {reportType === 'cash-summary' && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr><th className="px-4 py-2">Cash / bank account</th><th className="px-4 py-2 text-right">Received</th><th className="px-4 py-2 text-right">Released</th><th className="px-4 py-2 text-right">Ending balance</th></tr>
                    </thead>
                    <tbody>
                      {report.cashAccounts.map((row) => (
                        <tr key={row.account_id} className="border-t border-gray-100">
                          <td className="px-4 py-2">{row.account_name}</td>
                          <td className="px-4 py-2 text-right">₱{money(row.received)}</td>
                          <td className="px-4 py-2 text-right">₱{money(row.released)}</td>
                          <td className="px-4 py-2 text-right">₱{money(row.closing)}</td>
                        </tr>
                      ))}
                      {report.cashAccounts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No cash or bank accounts have posted activity in this report.</td></tr>}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <tr><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right">₱{money(report.cashReceived)}</td><td className="px-4 py-2 text-right">₱{money(report.cashReleased)}</td><td className="px-4 py-2 text-right">₱{money(report.cashBalance)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <footer className="document-signatures grid grid-cols-2 gap-10 pt-10 text-center text-xs text-gray-700">
                <div className="border-t border-gray-700 pt-2">Prepared by</div>
                <div className="border-t border-gray-700 pt-2">Reviewed and approved by</div>
              </footer>
              <div className="no-print mt-6 flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                <button type="button" onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-950 px-4 py-3 font-semibold text-white hover:bg-purple-900">
                  <Printer className="size-5" aria-hidden="true" />Print
                </button>
                <button type="button" disabled={loading} onClick={downloadReport} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-purple-300 px-4 py-3 font-semibold text-purple-900 hover:bg-purple-50 disabled:opacity-50">
                  <Download className="size-5" aria-hidden="true" />Download CSV
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
};

const ReportRows = ({ title, rows, total, color }) => (
  <div className="overflow-hidden rounded-lg border border-gray-200">
    <h4 className="border-b border-gray-200 px-4 py-3 text-lg font-semibold text-gray-900">{title}</h4>
    <table className="min-w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.account_id} className="border-b border-gray-100">
            <td className="px-4 py-2 text-gray-700">{row.account_name}</td>
            <td className="px-4 py-2 text-right font-medium text-gray-900">₱{money(row.amount)}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">No posted activity in this period.</td></tr>}
        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
          <td className="px-4 py-3">Total {title.toLowerCase()}</td>
          <td className={`px-4 py-3 text-right ${color === 'green' ? 'text-[#183b34]' : 'text-[#8b3f36]'}`}>₱{money(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export default FinancialReports;

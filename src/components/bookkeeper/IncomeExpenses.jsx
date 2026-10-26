import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchAccountBalances, toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const getPeriodRange = (period, referenceDate) => {
  const selectedDate = new Date(`${referenceDate}T00:00:00`);
  let start;
  let end;
  let label;

  if (period === 'daily') {
    start = selectedDate;
    end = selectedDate;
    label = selectedDate.toLocaleDateString();
  } else if (period === 'weekly') {
    const dayOfWeek = selectedDate.getDay();
    start = new Date(selectedDate);
    start.setDate(selectedDate.getDate() - ((dayOfWeek + 6) % 7));
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  } else if (period === 'quarterly') {
    const quarterStartMonth = Math.floor(selectedDate.getMonth() / 3) * 3;
    start = new Date(selectedDate.getFullYear(), quarterStartMonth, 1);
    end = new Date(selectedDate.getFullYear(), quarterStartMonth + 3, 0);
    label = `Q${Math.floor(selectedDate.getMonth() / 3) + 1} ${selectedDate.getFullYear()}`;
  } else if (period === 'annual') {
    start = new Date(selectedDate.getFullYear(), 0, 1);
    end = new Date(selectedDate.getFullYear(), 11, 31);
    label = String(selectedDate.getFullYear());
  } else {
    start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    label = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  return { start: toDateString(start), end: toDateString(end), label };
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const IncomeExpenses = () => {
  const [viewType, setViewType] = useState('income');
  const [period, setPeriod] = useState('monthly');
  const [referenceDate, setReferenceDate] = useState(toDateString(new Date()));
  const [accountBalances, setAccountBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const range = useMemo(() => getPeriodRange(period, referenceDate), [period, referenceDate]);

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const balances = await fetchAccountBalances(range.start, range.end);
      if (currentRequest !== requestId.current) return;
      setAccountBalances(balances);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load income and expense report:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'financial data'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useMultipleRealtimeSubscriptions([
    'journal_entries', 'journal_entry_lines', 'chart_of_accounts'
  ].map((table) => ({ table, onUpdate: loadData })), [loadData]);

  const incomeData = accountBalances
    .filter((account) => account.account_type === 'revenue')
    .map((account) => ({
      category: account.account_name,
      amount: (Number(account.period_credit) || 0) - (Number(account.period_debit) || 0)
    }))
    .filter((account) => account.amount !== 0);
  const expenseData = accountBalances
    .filter((account) => account.account_type === 'expense')
    .map((account) => ({
      category: account.account_name,
      amount: (Number(account.period_debit) || 0) - (Number(account.period_credit) || 0)
    }))
    .filter((account) => account.amount !== 0);
  const totalIncome = incomeData.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenseData.reduce((sum, item) => sum + item.amount, 0);
  const netIncome = totalIncome - totalExpenses;
  const currentData = viewType === 'income' ? incomeData : expenseData;
  const currentTotal = viewType === 'income' ? totalIncome : totalExpenses;
  const total = totalIncome + totalExpenses;
  const currentShare = currentTotal / (total || 1) * 100;

  const renderCategory = (item) => {
    const percentage = currentTotal > 0 ? (item.amount / currentTotal) * 100 : 0;
    return (
      <div key={item.category} className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">{item.category}</p>
          <div className="text-right">
            <p className={`text-lg font-bold ${viewType === 'income' ? 'text-green-600' : 'text-red-600'}`}>
              {formatMoney(item.amount)}
            </p>
            <p className="text-xs text-gray-500">{percentage.toFixed(1)}% of total</p>
          </div>
        </div>
        <div className="h-3 w-full rounded-full bg-gray-200">
          <div
            className={`h-3 rounded-full ${viewType === 'income' ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Period
            <select
              value={period}
              onChange={(event) => {
                setLoading(true);
                setError('');
                setPeriod(event.target.value);
              }}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Reference Date
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => {
                if (event.target.value) {
                  setLoading(true);
                  setError('');
                  setReferenceDate(event.target.value);
                }
              }}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-gray-500">Showing {range.label}</p>
      </div>

      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <p className="mb-2 text-sm text-gray-600">Total Income</p>
          <p className="text-3xl font-bold text-green-600">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="mb-2 text-sm text-gray-600">Total Expenses</p>
          <p className="text-3xl font-bold text-red-600">{formatMoney(totalExpenses)}</p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-6">
          <p className="mb-2 text-sm text-gray-600">Net Income</p>
          <p className="text-3xl font-bold text-purple-600">{formatMoney(netIncome)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setViewType('income')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              viewType === 'income' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Income Summary
          </button>
          <button
            onClick={() => setViewType('expense')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              viewType === 'expense' ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Expense Summary
          </button>
        </div>
        <div className="space-y-4 p-6">
          {loading && <p className="py-4 text-center text-gray-600">Loading financial data…</p>}
          {!loading && !error && currentData.length === 0 && (
            <p className="py-4 text-center text-gray-600">No posted {viewType} entries for this period.</p>
          )}
          {!loading && currentData.map(renderCategory)}
          <div className="mt-4 border-t-2 border-gray-300 pt-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <p className="text-lg font-bold text-gray-900">
                Total {viewType === 'income' ? 'Income' : 'Expenses'}
              </p>
              <p className={`text-3xl font-bold ${viewType === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                {formatMoney(currentTotal)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h3 className="mb-6 text-lg font-semibold text-gray-900">Income vs Expenses Comparison</h3>
        <div className="flex h-12 overflow-hidden rounded-lg">
          {total > 0 && (
            <>
              <div
                className="flex items-center justify-center bg-green-500 text-sm font-bold text-white"
                style={{ width: `${(totalIncome / total) * 100}%` }}
              >
                Income: {formatMoney(totalIncome)}
              </div>
              <div
                className="flex items-center justify-center bg-red-500 text-sm font-bold text-white"
                style={{ width: `${(totalExpenses / total) * 100}%` }}
              >
                Expenses: {formatMoney(totalExpenses)}
              </div>
            </>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-green-50 p-4 text-center">
            <p className="text-sm text-gray-600">Income Share</p>
            <p className="text-2xl font-bold text-green-600">{(totalIncome / (total || 1) * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-lg bg-red-50 p-4 text-center">
            <p className="text-sm text-gray-600">Expense Share</p>
            <p className="text-2xl font-bold text-red-600">{(totalExpenses / (total || 1) * 100).toFixed(1)}%</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div>
            <p className="mb-1 text-sm text-gray-600">Net Income</p>
          </div>
          <p className="text-3xl font-bold text-purple-600">{formatMoney(netIncome)}</p>
        </div>
        <p className="mt-4 text-right text-xs text-gray-500">{currentShare.toFixed(1)}% of combined income and expenses</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Report Options</h3>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-gray-600 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700"
        >
          Print Report
        </button>
      </div>
    </div>
  );
};

export default IncomeExpenses;

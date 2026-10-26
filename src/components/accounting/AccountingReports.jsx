import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import {
  PrintStyles, accountTypeLabel, amount, buttonClass, formatDate, inputClass, primaryButtonClass, startOfYearISO, todayISO
} from './accountingUtils';

const useBalances = (from, to) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_account_balances', { p_from: from || null, p_to: to || null });
    setError(rpcError ? getDataLoadErrorMessage(rpcError, 'financial report') : '');
    setRows(rpcError ? [] : data || []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useMultipleRealtimeSubscriptions([
    { table: 'journal_entries', onUpdate: load },
    { table: 'journal_entry_lines', onUpdate: load }
  ], [load]);

  return { rows, loading, error };
};

const Money = ({ value, bold }) => (
  <td className={`whitespace-nowrap px-4 py-1.5 text-right ${bold ? 'font-semibold' : ''}`}>
    {Number(value) ? Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (bold ? '0.00' : '')}
  </td>
);

export const TrialBalance = () => {
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const [mode, setMode] = useState('period');
  const { rows, loading, error } = useBalances(mode === 'period' ? from : null, to);

  const lines = useMemo(() => rows
    .map((row) => {
      if (mode === 'period') {
        return { ...row, debit: Number(row.period_debit), credit: Number(row.period_credit) };
      }
      const net = Number(row.total_debit) - Number(row.total_credit);
      return { ...row, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    })
    .filter((row) => row.debit || row.credit), [rows, mode]);

  const totalDebit = lines.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = lines.reduce((sum, row) => sum + row.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;
  const periodLabel = mode === 'period' ? `${formatDate(from)} to ${formatDate(to)}` : `Cumulative balances as of ${formatDate(to)}`;

  return (
    <div className="space-y-4">
      <PrintStyles />
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-gray-700">View
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="period">Period activity</option>
              <option value="cumulative">Cumulative balances</option>
            </select>
          </label>
          {mode === 'period' && (
            <label className="text-sm font-medium text-gray-700">From
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          )}
          <label className="text-sm font-medium text-gray-700">{mode === 'period' ? 'To' : 'As of'}
            <input type="date" value={to} min={mode === 'period' ? from : undefined} max={todayISO()} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <button type="button" onClick={() => window.print()} className={primaryButtonClass}><Printer className="size-4" aria-hidden="true" />Print</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <div id="gl-print" className="amcoms-print-document overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="amcoms-document-header border-b-4 px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
          <h2 className="mt-2 text-base font-semibold text-gray-900">Trial Balance</h2>
          <p className="text-sm text-gray-600">Period covered: {periodLabel}</p>
        </div>
        {loading ? <p className="py-8 text-center text-sm text-gray-500">Loading...</p> : error ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">The report could not be calculated. Resolve the error above and try again.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-gray-500">No posted transactions for this period.</td></tr>}
              {lines.map((row) => (
                <tr key={row.account_id} className="border-t border-gray-100">
                  <td className="px-4 py-1.5 text-gray-500">{row.account_code}</td>
                  <td className="px-4 py-1.5">{row.account_name}</td>
                  <Money value={row.debit} /><Money value={row.credit} />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <tr><td colSpan={2} className="px-4 py-2 text-right">Totals</td><Money value={totalDebit} bold /><Money value={totalCredit} bold /></tr>
              <tr>
                <td colSpan={4} className={`px-4 py-2 text-center text-sm ${balanced ? 'text-green-700' : 'text-red-700'}`}>
                  {balanced ? 'Debits equal credits. The ledger is in balance.' : `Out of balance by ${Math.abs(totalDebit - totalCredit).toFixed(2)}. Review journal entries.`}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {!loading && !error && (
          <footer className="document-signatures grid grid-cols-2 gap-10 px-4 pb-4 text-center text-xs text-gray-700">
            <div className="border-t border-gray-700 pt-2">Prepared by</div>
            <div className="border-t border-gray-700 pt-2">Reviewed and approved by</div>
          </footer>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, rows, valueKey, total }) => (
  <>
    <tr><td colSpan={2} className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-600">{title}</td></tr>
    {rows.length === 0 && <tr><td colSpan={2} className="px-6 py-1.5 text-gray-400">None</td></tr>}
    {rows.map((row) => (
      <tr key={row.account_id} className="border-t border-gray-100"><td className="px-6 py-1.5">{row.account_name}</td><Money value={row[valueKey]} /></tr>
    ))}
    <tr className="border-t border-gray-300 font-semibold"><td className="px-4 py-1.5">Total {title.toLowerCase()}</td><Money value={total} bold /></tr>
  </>
);

export const FinancialStatements = () => {
  const [from, setFrom] = useState(startOfYearISO());
  const [to, setTo] = useState(todayISO());
  const period = useBalances(from, to);
  const position = useBalances(null, to);

  const income = useMemo(() => {
    const revenue = period.rows.filter((r) => r.account_type === 'revenue').map((r) => ({ ...r, value: Number(r.period_credit) - Number(r.period_debit) })).filter((r) => r.value);
    const expense = period.rows.filter((r) => r.account_type === 'expense').map((r) => ({ ...r, value: Number(r.period_debit) - Number(r.period_credit) })).filter((r) => r.value);
    const totalRevenue = revenue.reduce((s, r) => s + r.value, 0);
    const totalExpense = expense.reduce((s, r) => s + r.value, 0);
    return { revenue, expense, totalRevenue, totalExpense, net: totalRevenue - totalExpense };
  }, [period.rows]);

  const sheet = useMemo(() => {
    const pick = (type) => position.rows.filter((r) => r.account_type === type).map((r) => ({ ...r, value: Number(r.closing_balance) })).filter((r) => r.value);
    const assets = pick('asset');
    const liabilities = pick('liability');
    const equity = pick('equity');
    const earnings = position.rows.reduce((sum, r) => {
      if (r.account_type === 'revenue') return sum + Number(r.closing_balance);
      if (r.account_type === 'expense') return sum - Number(r.closing_balance);
      return sum;
    }, 0);
    const sum = (rows) => rows.reduce((s, r) => s + r.value, 0);
    const equityRows = earnings ? [...equity, { account_id: 'earnings', account_name: 'Accumulated net income', value: earnings }] : equity;
    return {
      assets, liabilities, equityRows,
      totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equityRows)
    };
  }, [position.rows]);

  const withValue = (rows) => rows.map((r) => ({ ...r, v: r.value }));
  const loading = period.loading || position.loading;
  const error = period.error || position.error;
  const inBalance = Math.abs(sheet.totalAssets - (sheet.totalLiabilities + sheet.totalEquity)) < 0.005;

  return (
    <div className="space-y-4">
      <PrintStyles />
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-medium text-gray-700">Period from
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">To / as of
            <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <button type="button" onClick={() => window.print()} className={buttonClass}><Printer className="size-4" aria-hidden="true" />Print</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-gray-500">Loading...</p> : error ? (
        <p className="py-8 text-center text-sm text-gray-500">The report could not be calculated. Resolve the error above and try again.</p>
      ) : (
        <div id="gl-print" className="amcoms-print-document grid gap-4 lg:grid-cols-2">
          <header className="amcoms-document-header border-b-4 pb-4 text-center lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">Financial Statements</h2>
            <p className="text-sm text-gray-600">{formatDate(from)} to {formatDate(to)}</p>
            <p className="text-xs text-gray-500">Generated {new Date().toLocaleDateString('en-PH')}</p>
          </header>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-4 text-center">
              <h2 className="text-base font-semibold text-gray-900">Statement of Income and Expenses</h2>
              <p className="text-sm text-gray-600">{formatDate(from)} to {formatDate(to)}</p>
            </div>
            <table className="min-w-full text-sm"><tbody>
              <Section title="Revenue" rows={withValue(income.revenue)} valueKey="v" total={income.totalRevenue} />
              <Section title="Expenses" rows={withValue(income.expense)} valueKey="v" total={income.totalExpense} />
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-2">{income.net >= 0 ? 'Net surplus' : 'Net deficit'}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{Math.abs(income.net).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody></table>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-4 text-center">
              <h2 className="text-base font-semibold text-gray-900">Statement of Financial Position</h2>
              <p className="text-sm text-gray-600">As of {formatDate(to)}</p>
            </div>
            <table className="min-w-full text-sm"><tbody>
              <Section title={accountTypeLabel('asset')} rows={withValue(sheet.assets)} valueKey="v" total={sheet.totalAssets} />
              <Section title={accountTypeLabel('liability')} rows={withValue(sheet.liabilities)} valueKey="v" total={sheet.totalLiabilities} />
              <Section title={accountTypeLabel('equity')} rows={withValue(sheet.equityRows)} valueKey="v" total={sheet.totalEquity} />
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-2">Liabilities and equity</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{amount(sheet.totalLiabilities + sheet.totalEquity) || '0.00'}</td>
              </tr>
              <tr><td colSpan={2} className={`px-4 py-2 text-center text-xs ${inBalance ? 'text-green-700' : 'text-red-700'}`}>
                {inBalance ? 'Assets equal liabilities and equity.' : 'Assets do not equal liabilities and equity. Review journal entries.'}
              </td></tr>
            </tbody></table>
          </section>
          <footer className="document-signatures grid grid-cols-2 gap-10 pt-8 text-center text-xs text-gray-700 lg:col-span-2">
            <div className="border-t border-gray-700 pt-2">Prepared by</div>
            <div className="border-t border-gray-700 pt-2">Reviewed and approved by</div>
          </footer>
        </div>
      )}
    </div>
  );
};

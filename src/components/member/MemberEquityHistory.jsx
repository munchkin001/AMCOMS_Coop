import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, History, PhilippinePeso, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import MonthFilter from '../common/MonthFilter';
import { getMonthKey } from '../common/monthFilterUtils';

const formatPeso = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : 'Date unavailable';

const fetchAllRows = async (buildQuery) => {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await buildQuery().range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
};

const MemberEquityHistory = ({ kind }) => {
  const { staff } = useAuth();
  const memberId = staff?.member_id;
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isCapital = kind === 'capital';
  const filteredEntries = selectedMonth === 'all'
    ? entries
    : entries.filter((entry) => getMonthKey(entry.date) === selectedMonth);

  const loadHistory = useCallback(async () => {
    if (!memberId) {
      setError('Your member profile is not linked to a member record.');
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('total_capital, shares_owned')
        .eq('id', memberId)
        .single();

      if (memberError) throw memberError;
      setBalance(Number(isCapital ? member.total_capital : member.shares_owned) || 0);

      if (isCapital) {
        const [contributions, dividends] = await Promise.all([
          fetchAllRows(() => supabase
            .from('member_capital_contributions')
            .select('id, due_month, amount, receipt_id, created_at, status, void_reason')
            .eq('member_id', memberId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })),
          fetchAllRows(() => supabase
            .from('member_dividend_distributions')
            .select('id, distribution_date, reference_number, retention_amount, created_at')
            .eq('member_id', memberId)
            .gt('retention_amount', 0)
            .order('distribution_date', { ascending: false })
            .order('id', { ascending: false }))
        ]);

        const contributionEntries = contributions.map((item) => ({
          id: `contribution-${item.id}`,
          date: item.created_at,
          title: 'Monthly capital contribution',
          detail: `For ${new Date(`${item.due_month}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}${item.status === 'void' && item.void_reason ? ` · Void reason: ${item.void_reason}` : ''}`,
          reference: item.receipt_id,
          amount: Number(item.amount) || 0,
          status: item.status === 'void' ? 'Voided' : 'Recorded',
          voidReason: item.void_reason
        }));
        const dividendEntries = dividends.map((item) => ({
          id: `dividend-${item.id}`,
          date: item.distribution_date || item.created_at,
          title: 'Dividend retained as capital',
          detail: 'Added to your capital share balance',
          reference: item.reference_number,
          amount: Number(item.retention_amount) || 0,
          status: 'Recorded'
        }));
        setEntries([...contributionEntries, ...dividendEntries]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } else {
        const history = await fetchAllRows(() => supabase
          .from('member_share_history')
          .select('id, shares_change, shares_after, entry_type, description, occurred_at')
          .eq('member_id', memberId)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false }));
        setEntries(history.map((item) => ({
          ...item,
          date: item.occurred_at,
          title: item.entry_type === 'opening' ? 'Opening share balance' : 'Shares owned adjustment',
          detail: item.description
        })));
      }
    } catch (loadError) {
      console.error(`Unable to load member ${isCapital ? 'capital' : 'share'} history:`, loadError);
      setError(`Unable to load your ${isCapital ? 'capital share' : 'shares owned'} history. Please try again.`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [memberId, isCapital]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <section className="space-y-5">
      <header className="rounded-2xl bg-gradient-to-br from-[#0d3b2d] via-[#146344] to-[#174f39] p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f0d995]">
            {isCapital ? <PhilippinePeso aria-hidden="true" size={25} /> : <History aria-hidden="true" size={25} />}
          </span>
          <div>
            <p className="text-sm font-medium text-green-50/80">Current {isCapital ? 'capital share' : 'shares owned'}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {loading ? 'Loading...' : isCapital ? formatPeso(balance) : Number(balance).toLocaleString('en-PH')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-green-50/80">
              {isCapital
                ? 'Review monthly capital contributions and dividends retained in your capital balance.'
                : 'Review your opening balance and later adjustments to the number of shares you own.'}
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isCapital ? 'Capital share activity' : 'Share ownership activity'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredEntries.length}{selectedMonth !== 'all' ? ` of ${entries.length}` : ''} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthFilter
              dates={entries.map((entry) => entry.date)}
              value={selectedMonth}
              onChange={setSelectedMonth}
              id={`member-${kind}-history-month`}
            />
            <button
              type="button"
              onClick={loadHistory}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="m-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Loading account history...</p>
        ) : entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <History aria-hidden="true" className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 font-semibold text-slate-800">No history entries yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {isCapital
                ? balance > 0
                  ? 'Your current balance is shown above, but detailed entries are not available for older capital activity.'
                  : 'Capital contributions and retained dividends will appear here when recorded.'
                : 'Your share balance will appear here when ownership history has been recorded.'}
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <History aria-hidden="true" className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 font-semibold text-slate-800">No entries for this month</p>
            <p className="mt-1 text-sm text-slate-500">Choose another month or select all months to see your full history.</p>
          </div>
        ) : (
          <>
            {!isCapital && (
              <p className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-600 sm:px-6">
                Older changes are shown when available from member audit records. If no earlier audit record existed, the opening balance is the count when history tracking began.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 sm:px-6">Date</th>
                    <th className="px-5 py-3">Activity</th>
                    <th className="px-5 py-3">{isCapital ? 'Reference' : 'Change'}</th>
                    <th className="px-5 py-3 text-right">{isCapital ? 'Amount' : 'Shares after'}</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEntries.map((entry) => {
                    const change = Number(entry.shares_change) || 0;
                    const isIncrease = change >= 0;
                    return (
                      <tr key={entry.id} className="align-top text-sm">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600 sm:px-6">{formatDate(entry.date)}</td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">{entry.title}</p>
                          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{entry.detail || entry.voidReason || '—'}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {isCapital
                            ? <span className="break-all">{entry.reference || '—'}</span>
                            : <span className={`inline-flex items-center gap-1 font-semibold ${isIncrease ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {isIncrease ? <ArrowUpRight aria-hidden="true" size={15} /> : <ArrowDownLeft aria-hidden="true" size={15} />}
                                {isIncrease ? '+' : ''}{change.toLocaleString('en-PH')}
                              </span>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                          {isCapital ? `+${formatPeso(entry.amount)}` : Number(entry.shares_after || 0).toLocaleString('en-PH')}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            entry.status === 'Voided' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {entry.status || (entry.entry_type === 'opening' ? 'Opening balance' : 'Recorded')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default MemberEquityHistory;

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, Monitor, RefreshCw,
  Search, ShieldCheck, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';
import MonthFilter from '../common/MonthFilter';
import { getMonthKey } from '../common/monthFilterUtils';

const describeDevice = (userAgent) => {
  if (!userAgent) return 'Device not reported';
  const operatingSystem = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iOS'
      : /Windows NT/i.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Other device';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /OPR\//i.test(userAgent)
      ? 'Opera'
      : /Firefox\//i.test(userAgent)
        ? 'Firefox'
        : /Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : 'Browser';
  return `${operatingSystem} · ${browser}`;
};

const getActivityLabel = (log) => {
  if (log.table_name === 'authentication') {
    if (log.action === 'Signed in' || log.action === 'Signed out') return log.action;
    if (log.action === 'PASSWORD_CHANGED') return 'Password changed';
    if (log.action === 'PASSWORD_RESET_COMPLETED') return 'Password reset completed';
    return 'Account activity';
  }

  const action = log.action || '';
  const verb = action.startsWith('Created ')
    ? 'Added'
    : action.startsWith('Deleted ')
      ? 'Removed'
      : 'Updated';
  const table = action.replace(/^(Created|Updated|Deleted) /, '').replaceAll('_', ' ');
  return `${verb} ${table || 'account information'}`;
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  return {
    date: date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  };
};

const PAGE_SIZE = 10;

const MemberAuditLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const signInCount = logs.filter((log) => log.table_name === 'authentication' && log.action === 'Signed in').length;
  const accountChangeCount = logs.filter((log) => log.table_name === 'authentication' && log.action !== 'Signed in' && log.action !== 'Signed out').length;
  const filteredLogs = logs.filter((log) => {
    const isSignIn = log.table_name === 'authentication' && log.action === 'Signed in';
    const matchesType = activityFilter === 'all'
      || (activityFilter === 'sign-ins' && isSignIn)
      || (activityFilter === 'account' && !isSignIn);
    const searchableText = `${getActivityLabel(log)} ${log.table_name || ''} ${log.action || ''} ${describeDevice(log.user_agent)} ${formatDate(log.created_at).date} ${formatDate(log.created_at).time}`.toLowerCase();
    const matchesMonth = selectedMonth === 'all' || getMonthKey(log.created_at) === selectedMonth;
    return matchesType && matchesMonth && searchableText.includes(search.trim().toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const loadLogs = useCallback(async () => {
    if (!user?.id) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('member_audit_logs')
        .select('id, action, table_name, created_at, user_agent')
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryError) throw queryError;
      setLogs(data || []);
      setError('');
    } catch (loadError) {
      console.error('Unable to load member activity history:', loadError);
      setLogs([]);
      setError('Your account activity could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useRealtimeSubscription(
    'member_audit_logs',
    loadLogs,
    user?.id ? { column: 'auth_user_id', value: user.id } : null,
    [loadLogs],
    Boolean(user?.id)
  );

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Private account history
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Your account activity</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100">
            Review recent sign-ins and account changes. This activity is visible only to you.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh activity
        </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Monitor aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-500">Recorded sign-ins</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{loading ? '—' : signInCount}</p>
          </div>
        </article>
        <article className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-500">Account security updates</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{loading ? '—' : accountChangeCount}</p>
          </div>
        </article>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-semibold text-slate-900">Recent activity</h3>
            <p className="mt-1 text-xs text-slate-500">Newest events appear first. Select a row to inspect its details.</p>
          </div>
          {!loading && logs.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {filteredLogs.length} of {logs.length} events
            </span>
          )}
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:px-6">
          <label className="text-sm font-medium text-slate-700">
            Search activity
            <span className="relative mt-1 block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search action, date, or device"
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </span>
          </label>
          <div className="sm:self-end">
            <MonthFilter
              dates={logs.map((log) => log.created_at)}
              value={selectedMonth}
              onChange={(value) => { setSelectedMonth(value); setPage(1); }}
              id="member-audit-month"
            />
          </div>
          <label className="text-sm font-medium text-slate-700">
            Activity type
            <select
              value={activityFilter}
              onChange={(event) => { setActivityFilter(event.target.value); setPage(1); }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <option value="all">All activity</option>
              <option value="sign-ins">Sign-ins</option>
              <option value="account">Account changes</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="space-y-3 p-6" aria-label="Loading account activity">
            {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Activity aria-hidden="true" className="size-7" />
            </span>
            <p className="mt-4 text-base font-semibold text-slate-900">You’re all caught up</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Your sign-ins and account changes will show up here when they’re recorded.</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Search aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-4 text-base font-semibold text-slate-900">No matching activity</p>
            <p className="mt-1 text-sm text-slate-500">Try another search or activity type.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Date &amp; time</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Activity</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Device / browser</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageLogs.map((log) => {
                    const { date, time } = formatDate(log.created_at);
                    const isSignIn = log.table_name === 'authentication' && log.action === 'Signed in';
                    return (
                      <tr
                        key={log.id}
                        tabIndex={0}
                        aria-label={`View details: ${getActivityLabel(log)}`}
                        onClick={() => setSelectedLog(log)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedLog(log);
                          }
                        }}
                        className="cursor-pointer bg-white transition-colors hover:bg-emerald-50/60 focus:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          <span className="flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-3.5 text-slate-400" />{date}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-xs"><Clock3 aria-hidden="true" className="size-3.5 text-slate-400" />{time}</span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{getActivityLabel(log)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isSignIn ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                            {isSignIn ? 'Sign-in' : 'Account'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{describeDevice(log.user_agent)}</td>
                        <td className="px-5 py-4 text-right text-xs font-semibold text-emerald-800">View</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredLogs.length > PAGE_SIZE && (
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
                <p className="text-sm text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className="flex size-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                  </button>
                  <span className="px-2 text-sm font-medium text-slate-700">Page {currentPage} of {pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={currentPage === pageCount}
                    aria-label="Next page"
                    className="flex size-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-activity-title"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 px-5 py-5 text-white sm:px-7">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">
                    Account activity · {selectedLog.table_name === 'authentication' ? 'Account access' : 'Account details'}
                  </p>
                  <h2 id="member-activity-title" className="mt-1 break-words text-xl font-bold">{getActivityLabel(selectedLog)}</h2>
                  <p className="mt-1 text-sm text-emerald-100">{formatDate(selectedLog.created_at).date} · {formatDate(selectedLog.created_at).time}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  aria-label="Close activity details"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Activity</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{getActivityLabel(selectedLog)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Date and time</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{formatDate(selectedLog.created_at).date} · {formatDate(selectedLog.created_at).time}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Activity type</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{selectedLog.table_name === 'authentication' && selectedLog.action === 'Signed in' ? 'Sign-in' : 'Account'}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Source</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{selectedLog.table_name || 'Not recorded'}</dd>
                </div>
              </dl>
              <div className="rounded-xl bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                    <Monitor aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Device / browser</p>
                    <p className="mt-1 font-semibold text-slate-900">{describeDevice(selectedLog.user_agent)}</p>
                    {selectedLog.user_agent && (
                      <details className="mt-2">
                        <summary className="w-fit cursor-pointer text-xs font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950">
                          View browser details
                        </summary>
                        <p className="mt-2 break-all text-xs leading-5 text-slate-500">{selectedLog.user_agent}</p>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default MemberAuditLog;

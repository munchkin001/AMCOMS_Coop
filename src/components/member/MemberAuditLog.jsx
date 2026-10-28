import React, { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarDays, Clock3, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';

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

const MemberAuditLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const signInCount = logs.filter((log) => log.table_name === 'authentication' && log.action === 'Signed in').length;
  const accountChangeCount = logs.filter((log) => log.table_name === 'authentication' && log.action !== 'Signed in' && log.action !== 'Signed out').length;

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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-semibold text-slate-900">Recent activity</h3>
            <p className="mt-1 text-xs text-slate-500">Newest events appear first</p>
          </div>
          {!loading && logs.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {logs.length} {logs.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-4 p-6" aria-label="Loading account activity">
            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Activity aria-hidden="true" className="size-7" />
            </span>
            <p className="mt-4 text-base font-semibold text-slate-900">You’re all caught up</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Your sign-ins and account changes will show up here when they’re recorded.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const { date, time } = formatDate(log.created_at);
              const isSignIn = log.table_name === 'authentication' && log.action === 'Signed in';
              return (
                <article key={log.id} className="flex gap-4 px-5 py-5 transition-colors hover:bg-emerald-50/40 sm:px-6">
                  <div className="relative flex w-10 shrink-0 justify-center">
                    <span className={`relative z-10 flex size-10 items-center justify-center rounded-xl ${isSignIn ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {isSignIn ? <Monitor aria-hidden="true" className="size-5" /> : <Activity aria-hidden="true" className="size-5" />}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div>
                        <p className="font-semibold text-slate-900">{getActivityLabel(log)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarDays aria-hidden="true" className="size-3.5" />
                          {date}
                          <span className="px-0.5">·</span>
                          <Clock3 aria-hidden="true" className="size-3.5" />
                          {time}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isSignIn ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {isSignIn ? 'Sign-in' : 'Account'}
                      </span>
                    </div>
                    <div className="mt-3 flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                      <Monitor aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700">{describeDevice(log.user_agent)}</p>
                        {log.user_agent && (
                          <details className="mt-1">
                            <summary className="w-fit cursor-pointer text-xs font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950">
                              View browser details
                            </summary>
                            <p className="mt-2 break-all text-xs leading-5 text-slate-500">{log.user_agent}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default MemberAuditLog;

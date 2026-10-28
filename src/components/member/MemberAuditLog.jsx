import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
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

const MemberAuditLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Account Activity</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sign-ins and account changes recorded for your member account.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-semibold text-green-800 transition-colors hover:bg-green-50 disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading your activity...</p>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <Activity aria-hidden="true" className="mx-auto size-9 text-green-700" />
            <p className="mt-3 text-sm font-semibold text-slate-800">No activity recorded yet</p>
            <p className="mt-1 text-sm text-slate-500">Your account sign-ins and changes will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-green-50 text-xs font-bold uppercase tracking-wide text-green-950">
                <tr>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Device / Browser</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-green-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{getActivityLabel(log)}</td>
                    <td className="max-w-sm px-4 py-3 text-slate-700" title={log.user_agent || ''}>
                      {describeDevice(log.user_agent)}
                      {log.user_agent && <span className="mt-1 block truncate text-xs text-slate-500">{log.user_agent}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default MemberAuditLog;

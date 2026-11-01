import React, { startTransition, useCallback, useState, useEffect, useRef } from 'react';
import {
  Activity, Archive, CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Filter,
  RefreshCw, Search, ShieldCheck, UserRound, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

const PAGE_SIZE = 20;
const SENSITIVE_FIELD = /password|token|secret|api.?key|credential/i;

const getCurrentMonthKey = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  return `${year}-${month}`;
};

const getMonthRange = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

const formatMonth = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const formatDateKeyInManila = (date) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatDateTime = (date) => new Date(date).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
});

const formatFieldLabel = (field) => field
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const sanitizeAuditValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    SENSITIVE_FIELD.test(key) ? '[Redacted]' : sanitizeAuditValue(nestedValue)
  ]));
};

const formatAuditValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(sanitizeAuditValue(value), null, 2);
  return String(value);
};

const getChangedFields = (log) => {
  const oldData = log.old_data && typeof log.old_data === 'object' ? log.old_data : {};
  const newData = log.new_data && typeof log.new_data === 'object' ? log.new_data : {};
  const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  return Array.from(fields)
    .filter((field) => !SENSITIVE_FIELD.test(field))
    .filter((field) => JSON.stringify(oldData[field]) !== JSON.stringify(newData[field]))
    .map((field) => ({
      field,
      oldValue: Object.prototype.hasOwnProperty.call(oldData, field) ? formatAuditValue(oldData[field]) : 'Not present',
      newValue: Object.prototype.hasOwnProperty.call(newData, field) ? formatAuditValue(newData[field]) : 'Not present'
    }));
};

const AuditLog = () => {
  const [filters, setFilters] = useState({
    user: '',
    module: '',
    dateFrom: '',
    dateTo: '',
    action: ''
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [view, setView] = useState('current');
  const [currentMonthKey, setCurrentMonthKey] = useState(getCurrentMonthKey);
  const [archiveMonths, setArchiveMonths] = useState([]);
  const [selectedArchiveMonth, setSelectedArchiveMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [archiveLoadError, setArchiveLoadError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [page, setPage] = useState(1);
  const latestRequestRef = useRef(0);

  const fetchAuditLogs = useCallback(async () => {
    const monthKey = view === 'current' ? currentMonthKey : selectedArchiveMonth;
    if (!monthKey) {
      setAuditLogs([]);
      setLoadError('');
      setLoading(false);
      return;
    }

    const requestId = ++latestRequestRef.current;
    try {
      const { start, end } = getMonthRange(monthKey);
      const rows = [];
      const pageSize = 500;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('audit_logs')
          .select('id, action, table_name, record_id, old_data, new_data, ip_address, user_agent, created_at, staff:staff!audit_logs_user_id_fkey!inner(full_name, role)')
          .gte('created_at', start)
          .lt('created_at', end)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        query = query.eq('is_archived', view === 'archive');
        query = query.eq('is_relevant', true);
        query = query.neq('staff.role', 'member');

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        hasMore = (data || []).length === pageSize;
        offset += pageSize;
      }

      if (requestId === latestRequestRef.current) {
        startTransition(() => {
          setAuditLogs(rows);
          setLoadError('');
        });
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      if (requestId === latestRequestRef.current) {
        startTransition(() => {
          setAuditLogs([]);
          setLoadError('System activity could not be loaded. Please try again.');
        });
      }
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }
  }, [view, currentMonthKey, selectedArchiveMonth]);

  const fetchArchiveMonths = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_audit_log_archive_months');
      if (error) throw error;
      const months = (data || []).map(({ month_start }) => month_start);
      setArchiveMonths(months);
      setSelectedArchiveMonth((current) => months.includes(current) ? current : months[0] || '');
      setArchiveLoadError('');
    } catch (error) {
      console.error('Error fetching archived audit months:', error);
      setArchiveLoadError('Archived months could not be loaded. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    const refreshVisibleLog = () => {
      if (document.visibilityState === 'visible') {
        fetchAuditLogs();
        fetchArchiveMonths();
      }
    };
    window.addEventListener('focus', refreshVisibleLog);
    document.addEventListener('visibilitychange', refreshVisibleLog);

    return () => {
      window.removeEventListener('focus', refreshVisibleLog);
      document.removeEventListener('visibilitychange', refreshVisibleLog);
    };
  }, [fetchArchiveMonths, fetchAuditLogs]);

  useEffect(() => {
    let previousMonth = getCurrentMonthKey();
    const timer = window.setInterval(() => {
      const nextMonth = getCurrentMonthKey();
      if (nextMonth !== previousMonth) {
        previousMonth = nextMonth;
        setFilters((current) => ({ ...current, dateFrom: '', dateTo: '' }));
        setLoading(true);
        setCurrentMonthKey(nextMonth);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchArchiveMonths();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchArchiveMonths]);

  useRealtimeSubscription('audit_logs', (payload) => {
    const changedLog = payload.new || payload.old;
    const changedMonth = changedLog?.created_at && formatDateKeyInManila(changedLog.created_at).slice(0, 7);
    const activeMonth = view === 'current' ? currentMonthKey : selectedArchiveMonth;

    if (changedMonth === activeMonth || payload.eventType === 'DELETE') {
      fetchAuditLogs();
    }
    fetchArchiveMonths();
  }, null, [fetchArchiveMonths, fetchAuditLogs]);

  const getModule = (tableName) => {
    if (tableName === 'authentication') return 'Account access';
    if (['loans', 'loan_payments', 'loan_products', 'loan_applications'].includes(tableName)) return 'Loans';
    if (['members', 'staff', 'member_applications'].includes(tableName)) return 'Members';
    if (['products', 'product_categories', 'stock_inventory', 'stock_movements', 'production_records', 'purchases', 'purchase_items', 'sales_orders', 'sales_order_items', 'suppliers'].includes(tableName)) return 'Inventory';
    if (['cash_receipts', 'cash_receipt_lines', 'cash_disbursements', 'cash_disbursement_lines', 'journal_entries', 'journal_entry_lines', 'general_journal', 'general_ledger', 'accounts', 'chart_of_accounts', 'savings_accounts', 'savings_transactions'].includes(tableName)) return 'Financial';
    if (tableName === 'requests') return 'Requests';
    if (tableName === 'documents') return 'Documents';
    if (tableName === 'system_settings') return 'Settings';
    if (['notifications', 'sms_logs', 'email_logs', 'announcements'].includes(tableName)) return 'Messages';
    return 'System activity';
  };

  const tableLabels = {
    staff: 'staff profile',
    members: 'member profile',
    member_applications: 'membership application',
    loans: 'loan',
    loan_applications: 'loan application',
    loan_payments: 'loan payment',
    loan_products: 'loan product',
    savings_accounts: 'savings account',
    savings_transactions: 'savings entry',
    cash_receipts: 'cash receipt',
    cash_receipt_lines: 'receipt entry',
    cash_disbursements: 'cash disbursement',
    cash_disbursement_lines: 'disbursement entry',
    journal_entries: 'journal entry',
    journal_entry_lines: 'journal entry line',
    general_journal: 'journal entry',
    general_ledger: 'ledger entry',
    accounts: 'account',
    chart_of_accounts: 'chart of accounts entry',
    products: 'product',
    product_categories: 'product category',
    stock_inventory: 'inventory record',
    stock_movements: 'stock movement',
    production_records: 'production entry',
    purchases: 'purchase',
    purchase_items: 'purchase entry',
    sales_orders: 'sales order',
    sales_order_items: 'sales entry',
    suppliers: 'supplier',
    announcements: 'announcement',
    notifications: 'notification',
    sms_logs: 'message',
    email_logs: 'email',
    documents: 'document',
    requests: 'request',
    system_settings: 'system setting',
  };

  const getActorName = (log) => log.staff?.full_name || 'Historical activity';
  const getActivityLabel = (log) => {
    if (log.table_name === 'authentication') {
      return log.action || 'Account activity';
    }

    const actionMatch = log.action?.match(/^(Created|Updated|Deleted)\s+/);
    if (!actionMatch) return log.action || 'System activity';
    const actionVerb = { Created: 'Added', Updated: 'Updated', Deleted: 'Removed' }[actionMatch[1]];
    const tableName = log.action.slice(actionMatch[0].length).toLowerCase();
    return `${actionVerb} ${tableLabels[tableName] || tableLabels[log.table_name] || 'system entry'}`;
  };

  const filteredLogs = auditLogs.filter((log) => {
    const actorName = getActorName(log);
    const eventDate = formatDateKeyInManila(log.created_at);
    return (!filters.user || actorName.toLowerCase().includes(filters.user.toLowerCase()))
      && (!filters.module || getModule(log.table_name) === filters.module)
      && (!filters.action || getActivityLabel(log).toLowerCase().includes(filters.action.toLowerCase()))
      && (!filters.dateFrom || eventDate >= filters.dateFrom)
      && (!filters.dateTo || eventDate <= filters.dateTo);
  });

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeStaffCount = new Set(auditLogs.map((log) => getActorName(log))).size;
  const activeAreaCount = new Set(auditLogs.map((log) => getModule(log.table_name))).size;
  const accessEventCount = auditLogs.filter((log) => log.table_name === 'authentication').length;
  const latestActivity = auditLogs[0] ? formatDateTime(auditLogs[0].created_at) : 'No activity yet';
  const selectedChanges = selectedLog ? getChangedFields(selectedLog) : [];

  const handleReset = () => {
    setFilters({ user: '', module: '', dateFrom: '', dateTo: '', action: '' });
    setPage(1);
  };

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  };

  const handleExport = () => {
    const rows = [
      ['Date and time (Manila)', 'Staff', 'Role', 'Activity', 'Area', 'Table', 'Record ID'],
      ...filteredLogs.map((log) => [
        formatDateTime(log.created_at),
        getActorName(log),
        log.staff?.role || '',
        getActivityLabel(log),
        getModule(log.table_name),
        log.table_name || '',
        log.record_id || ''
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    const monthKey = view === 'current' ? currentMonthKey : selectedArchiveMonth;
    link.download = `staff-activity-${monthKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getModuleColor = (module) => {
    const colors = {
      Loans: 'bg-blue-100 text-blue-800',
      Financial: 'bg-green-100 text-green-800',
      Inventory: 'bg-orange-100 text-orange-800',
      Members: 'bg-cyan-100 text-cyan-800',
      'Account access': 'bg-blue-100 text-blue-800',
      Messages: 'bg-indigo-100 text-indigo-800',
      Requests: 'bg-amber-100 text-amber-800',
      Documents: 'bg-cyan-100 text-cyan-800',
      Settings: 'bg-gray-100 text-gray-800',
      'System activity': 'bg-gray-100 text-gray-800'
    };
    return colors[module] || 'bg-gray-100 text-gray-800';
  };

  const displayedMonth = view === 'current'
    ? formatMonth(currentMonthKey)
    : selectedArchiveMonth ? formatMonth(selectedArchiveMonth) : 'Archived Logs';

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-[#173b35] to-emerald-800 p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[30px] border-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Staff activity oversight
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Audit log</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100">
              Review staff actions, account access, and record changes. Select an entry to inspect its audit details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setLoading(true); fetchAuditLogs(); }}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!filteredLogs.length}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download aria-hidden="true" className="size-4" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-white/15 pt-4 text-sm text-emerald-100">
          <span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4" />{displayedMonth}</span>
          <span className="hidden text-emerald-300 sm:inline">•</span>
          <span className="inline-flex items-center gap-2"><Clock3 aria-hidden="true" className="size-4" />Latest: {latestActivity}</span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Recorded events', value: auditLogs.length, icon: Activity, tone: 'bg-emerald-50 text-emerald-800' },
          { label: 'Staff represented', value: activeStaffCount, icon: UserRound, tone: 'bg-blue-50 text-blue-800' },
          { label: 'Areas with activity', value: activeAreaCount, icon: Filter, tone: 'bg-violet-50 text-violet-800' },
          { label: 'Account access events', value: accessEventCount, icon: ShieldCheck, tone: 'bg-amber-50 text-amber-800' }
        ].map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : value}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Activity range</h2>
            <p className="mt-1 text-sm text-slate-500">Choose current or archived activity, then narrow the results.</p>
          </div>
          {view === 'archive' && (
            <label htmlFor="archive-month" className="w-full text-sm font-medium text-slate-700 sm:w-auto">
              Archive month
              <select
                id="archive-month"
                value={selectedArchiveMonth}
                onChange={(event) => {
                  setLoading(true);
                  setSelectedArchiveMonth(event.target.value);
                  setPage(1);
                }}
                disabled={!archiveMonths.length}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:bg-slate-100 sm:min-w-48"
              >
                {!archiveMonths.length && <option value="">No archived months</option>}
                {archiveMonths.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1" aria-label="Audit log period">
          <button
            type="button"
            onClick={() => { setLoading(true); setView('current'); setPage(1); }}
            aria-pressed={view === 'current'}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${view === 'current' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Current month
          </button>
          <button
            type="button"
            onClick={() => {
              if (!archiveMonths.length) {
                setAuditLogs([]);
                setLoading(false);
              } else {
                setLoading(true);
              }
              setView('archive');
              setPage(1);
            }}
            aria-pressed={view === 'archive'}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${view === 'archive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Archive aria-hidden="true" className="size-4" />
            Archived
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            Staff member
            <span className="relative mt-1 block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filters.user}
                onChange={(event) => handleFilterChange('user', event.target.value)}
                placeholder="Search staff"
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </span>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Area
            <select
              value={filters.module}
              onChange={(event) => handleFilterChange('module', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <option value="">All areas</option>
              <option value="Loans">Loans</option>
              <option value="Financial">Financial</option>
              <option value="Inventory">Inventory</option>
              <option value="Members">Members</option>
              <option value="Account access">Account access</option>
              <option value="Messages">Messages</option>
              <option value="Requests">Requests</option>
              <option value="Documents">Documents</option>
              <option value="Settings">Settings</option>
              <option value="System activity">System activity</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date from
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => handleFilterChange('dateFrom', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date to
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => handleFilterChange('dateTo', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Activity
            <span className="relative mt-1 block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filters.action}
                onChange={(event) => handleFilterChange('action', event.target.value)}
                placeholder="Search activity"
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-800">{filteredLogs.length}</span> of {auditLogs.length} events in {displayedMonth}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Clear filters
          </button>
        </div>
      </section>

      {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>}
      {archiveLoadError && view === 'archive' && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{archiveLoadError}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Activity entries</h2>
            <p className="mt-1 text-xs text-slate-500">Newest first · times shown in Manila time · select a row for details</p>
          </div>
          {!loading && filteredLogs.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {filteredLogs.length} {filteredLogs.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </header>

        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading audit activity">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Activity aria-hidden="true" className="size-7" />
            </span>
            <p className="mt-4 text-base font-semibold text-slate-900">
              {auditLogs.length ? 'No entries match these filters' : view === 'archive' ? 'No archived activity for this month' : 'No staff activity this month'}
            </p>
            <p className="mt-1 text-sm text-slate-500">{auditLogs.length ? 'Clear or adjust the filters to see more entries.' : 'Recorded staff actions will appear here.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Date &amp; time</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Staff</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Activity</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Area</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Record</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageLogs.map((log) => {
                  const module = getModule(log.table_name);
                  return (
                    <tr
                      key={log.id}
                      tabIndex={0}
                      aria-label={`View details: ${getActivityLabel(log)} by ${getActorName(log)}`}
                      onClick={() => setSelectedLog(log)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedLog(log);
                        }
                      }}
                      className="cursor-pointer bg-white transition-colors hover:bg-emerald-50/60 focus:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDateTime(log.created_at)}</td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{getActorName(log)}</p>
                        <p className="mt-0.5 text-xs capitalize text-slate-500">{log.staff?.role || 'Staff account'}</p>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-800">{getActivityLabel(log)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getModuleColor(module)}`}>{module}</span>
                      </td>
                      <td className="max-w-48 truncate px-5 py-4 font-mono text-xs text-slate-500" title={log.record_id || log.table_name || ''}>
                        {log.record_id || log.table_name || '—'}
                      </td>
                      <td className="px-5 py-4 text-right text-xs font-semibold text-emerald-800">View</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredLogs.length > PAGE_SIZE && (
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
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-entry-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-[#173b35] to-emerald-800 px-5 py-5 text-white sm:px-7">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Audit entry · {getModule(selectedLog.table_name)}</p>
                  <h2 id="audit-entry-title" className="mt-1 break-words text-xl font-bold">{getActivityLabel(selectedLog)}</h2>
                  <p className="mt-1 text-sm text-emerald-100">{getActorName(selectedLog)}{selectedLog.staff?.role ? ` · ${selectedLog.staff.role}` : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  aria-label="Close audit entry details"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Date and time', formatDateTime(selectedLog.created_at)],
                  ['Area', getModule(selectedLog.table_name)],
                  ['Source table', selectedLog.table_name || 'Not recorded'],
                  ['Record ID', selectedLog.record_id || 'Not recorded'],
                  ['IP address', selectedLog.ip_address || 'Not recorded']
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 break-all text-sm font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {selectedLog.user_agent && (
                <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Client information</summary>
                  <p className="mt-2 break-all text-xs leading-5 text-slate-600">{selectedLog.user_agent}</p>
                </details>
              )}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <header className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">Recorded field changes</h3>
                  <p className="mt-1 text-xs text-slate-500">Sensitive credential fields are hidden.</p>
                </header>
                {selectedChanges.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">No field-level changes were recorded for this event.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="px-4 py-2.5 font-semibold">Field</th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">Previous value</th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">New value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedChanges.map(({ field, oldValue, newValue }) => (
                          <tr key={field} className="align-top">
                            <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">{formatFieldLabel(field)}</th>
                            <td className="max-w-64 break-words px-4 py-3 text-slate-600"><pre className="whitespace-pre-wrap break-words font-sans text-xs">{oldValue}</pre></td>
                            <td className="max-w-64 break-words px-4 py-3 text-slate-900"><pre className="whitespace-pre-wrap break-words font-sans text-xs">{newValue}</pre></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <footer className="flex justify-end border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2"
              >
                Close details
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default AuditLog;

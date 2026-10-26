import React, { startTransition, useCallback, useState, useEffect, useRef } from 'react';
import { Archive, Download, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

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
          .select('id, action, table_name, created_at, staff:staff!audit_logs_user_id_fkey(full_name, role)')
          .gte('created_at', start)
          .lt('created_at', end)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        query = query.eq('is_archived', view === 'archive');
        query = query.eq('is_relevant', true);

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

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

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
      return log.action === 'Signed in' ? 'Signed in' : 'Signed out';
    }

    const actionVerb = log.action?.startsWith('Created ')
      ? 'Added'
      : log.action?.startsWith('Deleted ')
        ? 'Removed'
        : 'Updated';
    return `${actionVerb} ${tableLabels[log.table_name] || 'system entry'}`;
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

  const handleReset = () => {
    setFilters({ user: '', module: '', dateFrom: '', dateTo: '', action: '' });
  };

  const handleExport = () => {
    const rows = [
      ['Date and time', 'Staff or member', 'Role', 'Activity', 'Area'],
      ...filteredLogs.map((log) => [
        new Date(log.created_at).toLocaleString(),
        getActorName(log),
        log.staff?.role || '',
        getActivityLabel(log),
        getModule(log.table_name),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    const monthKey = view === 'current' ? currentMonthKey : selectedArchiveMonth;
    link.download = `system-activity-${monthKey}.csv`;
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
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1" aria-label="Audit log view">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setView('current');
            }}
            aria-pressed={view === 'current'}
            className={`min-h-11 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 ${view === 'current' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Current Month
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
            }}
            aria-pressed={view === 'archive'}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 ${view === 'archive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Archive aria-hidden="true" className="size-4" />
            Archived Logs
          </button>
        </div>
        {view === 'archive' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="archive-month" className="text-sm font-medium text-gray-700">Archive month</label>
            <select
              id="archive-month"
              value={selectedArchiveMonth}
              onChange={(event) => {
                setLoading(true);
                setSelectedArchiveMonth(event.target.value);
              }}
              disabled={!archiveMonths.length}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-100"
            >
              {!archiveMonths.length && <option value="">No archived months</option>}
              {archiveMonths.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter {displayedMonth} Activity</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Staff or Member</label>
            <input
              type="text"
              value={filters.user}
              onChange={(e) => handleFilterChange('user', e.target.value)}
              placeholder="Search staff"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Area</label>
            <select
              value={filters.module}
              onChange={(e) => handleFilterChange('module', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">All Areas</option>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Activity</label>
            <input
              type="text"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              placeholder="Search activity"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Reset Filters
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors font-medium"
          >
            <Download aria-hidden="true" className="size-4" />
            Export to CSV
          </button>
        </div>
      </div>

      {loadError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>}
      {archiveLoadError && view === 'archive' && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{archiveLoadError}</p>}

      {/* Results Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          {displayedMonth}: showing <span className="font-semibold">{filteredLogs.length}</span> of <span className="font-semibold">{auditLogs.length}</span> system activity entries
        </p>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <p className="text-sm">Loading activity...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium">{auditLogs.length ? 'No entries match these filters' : view === 'archive' ? 'No archived activity for this month' : 'No system activity this month'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Date & Time</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Staff or Member</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Activity</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Area</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="whitespace-nowrap py-3 px-4 text-sm text-gray-900">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{getActorName(log)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{getActivityLabel(log)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getModuleColor(getModule(log.table_name))}`}>
                        {getModule(log.table_name)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};

export default AuditLog;

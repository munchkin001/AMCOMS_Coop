import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import DiscrepancyPanel from '../common/DiscrepancyPanel';
import { formatDateTime } from './accountingUtils';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const AuditTrail = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('audit_logs')
      .select('id, action, table_name, created_at, new_data, staff:staff!audit_logs_user_id_fkey(full_name, role)')
      .in('table_name', ['journal_entries', 'chart_of_accounts'])
      .order('created_at', { ascending: false })
      .limit(100);
    setError(queryError ? getDataLoadErrorMessage(queryError, 'audit history') : '');
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useMultipleRealtimeSubscriptions([{ table: 'audit_logs', onUpdate: load }], [load]);

  const describe = (row) => {
    const data = row.new_data || {};
    const parts = [data.entry_number, data.status && `status: ${data.status}`, data.reversal_reason && `reason: ${data.reversal_reason}`, data.account_name];
    return parts.filter(Boolean).join(' | ');
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Ledger audit trail</h3>
        <p className="text-xs text-gray-500">Every creation, posting and reversal of a journal entry is recorded with the staff member and time.</p>
      </header>
      {error && <p role="alert" className="px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-gray-500">Loading...</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Staff</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Details</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-500">No ledger activity recorded.</td></tr>}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatDateTime(row.created_at)}</td>
                  <td className="px-4 py-2">{row.staff?.full_name || 'You'}{row.staff?.role ? <span className="ml-1 text-xs capitalize text-gray-500">({row.staff.role})</span> : null}</td>
                  <td className="px-4 py-2">{row.action}</td>
                  <td className="px-4 py-2 text-gray-600">{describe(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const ReviewPanel = () => (
  <div className="space-y-6">
    <DiscrepancyPanel />
    <AuditTrail />
  </div>
);

export default ReviewPanel;

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (value) => (value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const DiscrepancyPanel = () => {
  const { staff } = useAuth();
  const [recorded, setRecorded] = useState([]);
  const [scanned, setScanned] = useState([]);
  const [members, setMembers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [recordedRes, scanRes] = await Promise.all([
      supabase.from('data_discrepancies').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('data_discrepancy_scan').select('*').order('detected_at', { ascending: false })
    ]);
    if (recordedRes.error || scanRes.error) {
      setError((recordedRes.error || scanRes.error).message);
    } else {
      setError('');
    }
    const recordedRows = recordedRes.data || [];
    const scanRows = scanRes.data || [];
    setRecorded(recordedRows);
    setScanned(scanRows);

    const ids = [...new Set([...recordedRows, ...scanRows].map((row) => row.member_id).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('members').select('id, first_name, last_name').in('id', ids);
      setMembers(Object.fromEntries((data || []).map((m) => [m.id, `${m.first_name} ${m.last_name}`])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'data_discrepancies', onUpdate: load },
    { table: 'loans', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'savings_accounts', onUpdate: load },
    { table: 'savings_transactions', onUpdate: load },
    { table: 'stock_inventory', onUpdate: load },
    { table: 'journal_entries', onUpdate: load },
    { table: 'journal_entry_lines', onUpdate: load },
    { table: 'members', onUpdate: load }
  ], [load]);

  const resolve = async (id) => {
    const { error: updateError } = await supabase
      .from('data_discrepancies')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: staff?.id || null })
      .eq('id', id);
    if (updateError) setError(updateError.message);
  };

  const total = recorded.length + scanned.length;

  if (loading) return null;

  return (
    <section className={`rounded-xl border bg-white ${total ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Data Discrepancies</h3>
          <p className="text-xs text-gray-500">Checked live against recorded transactions, loans, savings, inventory and the journal.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${total ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {total ? `${total} open` : 'None found'}
        </span>
      </div>
      {error && <p className="px-4 py-2 text-sm text-red-700">{error}</p>}
      {total > 0 && (
        <ul className="divide-y divide-gray-100">
          {recorded.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {row.category}{row.reference ? ` - ${row.reference}` : ''}{row.member_id && members[row.member_id] ? ` - ${members[row.member_id]}` : ''}
                </p>
                <p className="text-sm text-red-700">{row.reason}</p>
                <p className="text-xs text-gray-500">{fmt(row.created_at)}{row.amount ? ` - ${peso(row.amount)}` : ''}</p>
              </div>
              <button onClick={() => resolve(row.id)} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Mark resolved
              </button>
            </li>
          ))}
          {scanned.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                {row.category}{row.reference ? ` - ${row.reference}` : ''}{row.member_id && members[row.member_id] ? ` - ${members[row.member_id]}` : ''}
              </p>
              <p className="text-sm text-red-700">{row.reason}</p>
              <p className="text-xs text-gray-500">Clears automatically once the data is corrected.</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default DiscrepancyPanel;

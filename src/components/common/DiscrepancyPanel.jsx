import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import {
  emptyReconciliationDay,
  loadReconciliationDays,
  localDate,
  reconciliationRows,
  sameReconciliationValue,
} from '../../lib/dailyReconciliation';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (value) => (value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const DiscrepancyPanel = ({ reconciliationDate = localDate() }) => {
  const { staff } = useAuth();
  const [recorded, setRecorded] = useState([]);
  const [scanned, setScanned] = useState([]);
  const [reconciliationIssues, setReconciliationIssues] = useState([]);
  const [members, setMembers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [recordedRes, scanRes, reconciliationResult] = await Promise.all([
        supabase.from('data_discrepancies').select('*').eq('status', 'open').order('created_at', { ascending: false }),
        supabase.from('data_discrepancy_scan').select('*').order('detected_at', { ascending: false }),
        loadReconciliationDays(reconciliationDate, 1),
      ]);
      if (recordedRes.error || scanRes.error) {
        throw recordedRes.error || scanRes.error;
      }

      const recordedRows = recordedRes.data || [];
      const scanRows = scanRes.data || [];
      setRecorded(recordedRows);
      setScanned(scanRows);

      const currentDay = reconciliationResult.days[reconciliationDate] || emptyReconciliationDay();
      setReconciliationIssues(reconciliationRows(currentDay).filter((row) =>
        !sameReconciliationValue(row.books, row.ledger)
      ));

      const ids = [...new Set([...recordedRows, ...scanRows].map((row) => row.member_id).filter(Boolean))];
      if (ids.length) {
        const { data, error: memberError } = await supabase.from('members').select('id, first_name, last_name').in('id', ids);
        if (memberError) throw memberError;
        setMembers(Object.fromEntries((data || []).map((member) => [member.id, `${member.first_name} ${member.last_name}`])));
      } else {
        setMembers({});
      }
      setError('');
    } catch (loadError) {
      console.error('Unable to load dashboard discrepancies:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Dashboard discrepancies could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [reconciliationDate]);

  useEffect(() => { load(); }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'data_discrepancies', onUpdate: load },
    { table: 'loans', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'cash_receipts', onUpdate: load },
    { table: 'cash_receipt_lines', onUpdate: load },
    { table: 'cash_disbursements', onUpdate: load },
    { table: 'cash_disbursement_lines', onUpdate: load },
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

  const total = recorded.length + scanned.length + reconciliationIssues.length;

  if (loading) return null;

  return (
    <section className={`rounded-xl border bg-white ${total ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Data Discrepancies</h3>
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
            </li>
          ))}
          {reconciliationIssues.map((row) => (
            <li key={`reconciliation-${row.label}`} className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                Cash reconciliation - {row.label} ({reconciliationDate})
              </p>
              <p className="text-sm text-red-700">
                Cash books: {row.count ? row.books : peso(row.books)} · Ledger / member records: {row.count ? row.ledger : peso(row.ledger)} · Difference: {row.count ? Math.abs(row.books - row.ledger) : peso(Math.abs(row.books - row.ledger))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default DiscrepancyPanel;

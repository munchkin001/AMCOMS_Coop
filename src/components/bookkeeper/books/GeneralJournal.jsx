import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { supabase } from '../../../lib/supabase';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const getPeriodRange = (period) => {
  const match = String(period || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTH_NAMES.findIndex((month) => month.toLowerCase() === match[1].toLowerCase());
  const year = Number(match[2]);
  if (monthIndex < 0) return null;

  return {
    from: `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`,
    to: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10),
  };
};

const GeneralJournal = ({ period = 'April 2026' }) => {
  const [entries, setEntries] = useState([]);
  const [loadedPeriod, setLoadedPeriod] = useState('');
  const [error, setError] = useState('');
  const periodRange = getPeriodRange(period);
  const from = periodRange?.from;
  const to = periodRange?.to;
  const loading = loadedPeriod !== period;
  const latestRequest = useRef(0);

  const fetchEntries = useCallback(async () => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    if (!from || !to) {
      setEntries([]);
      setError('Select a valid accounting period.');
      setLoadedPeriod(period);
      return;
    }

    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, entry_type, journal_entry_lines(id, debit_amount, credit_amount, description, account:chart_of_accounts(account_name))')
        .eq('status', 'posted')
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      if (requestId === latestRequest.current) {
        setEntries((data || []).filter((entry) => entry.journal_entry_lines?.length));
      }
    } catch (fetchError) {
      console.error('Unable to load General Journal entries:', fetchError);
      if (requestId === latestRequest.current) {
        setError(`General Journal entries could not be loaded: ${fetchError.message || 'Please try again.'}`);
      }
    } finally {
      if (requestId === latestRequest.current) setLoadedPeriod(period);
    }
  }, [from, period, to]);

  useEffect(() => {
    fetchEntries();
    return () => { latestRequest.current += 1; };
  }, [fetchEntries]);

  useRealtimeSubscription('journal_entries', fetchEntries, null, [fetchEntries]);
  useRealtimeSubscription('journal_entry_lines', fetchEntries, null, [fetchEntries]);

  const formatAmount = (value) => {
    const amount = Number(value) || 0;
    return amount === 0 ? '' : `₱${amount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };
  const totalDebits = entries.reduce((total, entry) => total + (entry.journal_entry_lines || [])
    .reduce((sum, line) => sum + Number(line.debit_amount || 0), 0), 0);
  const totalCredits = entries.reduce((total, entry) => total + (entry.journal_entry_lines || [])
    .reduce((sum, line) => sum + Number(line.credit_amount || 0), 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>General Journal</strong> – Posted journal entries with account-level debits and credits for {period}.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Date</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Reference</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Account / Particulars</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-700">Debit</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-700">Credit</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {entries.flatMap((entry) => (entry.journal_entry_lines || []).map((line, index) => {
                const account = Array.isArray(line.account) ? line.account[0] : line.account;
                return (
                  <tr key={line.id} className={index === 0 ? 'border-t-2 border-gray-300' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900">
                      {index === 0 ? new Date(`${entry.entry_date}T00:00:00`).toLocaleDateString('en-PH') : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-purple-700">
                      {index === 0 ? (
                        <>
                          {entry.entry_number}
                          {entry.entry_type === 'adjusting' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Adjustment</span>}
                        </>
                      ) : ''}
                    </td>
                    <td className={`px-4 py-2 text-sm text-gray-900 ${index > 0 ? 'pl-8' : ''}`}>
                      <span className="font-medium">{account?.account_name || 'Account unavailable'}</span>
                      {(line.description || (index === 0 ? entry.description : '')) && (
                        <span className="ml-2 text-gray-500">{line.description || entry.description}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium text-gray-900">{formatAmount(line.debit_amount)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium text-gray-900">{formatAmount(line.credit_amount)}</td>
                  </tr>
                );
              }))}
            </tbody>
            {!loading && entries.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-purple-50">
                <tr>
                  <th scope="row" colSpan={3} className="px-4 py-3 text-left text-sm font-bold text-gray-900">Period totals</th>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-gray-900">{formatAmount(totalDebits)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-gray-900">{formatAmount(totalCredits)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {loading && <p className="p-5 text-center text-sm text-gray-500">Loading General Journal…</p>}
          {!loading && entries.length === 0 && !error && <p className="p-5 text-center text-sm text-gray-500">No posted journal entries for {period}.</p>}
        </div>
      </div>
    </div>
  );
};

export default GeneralJournal;

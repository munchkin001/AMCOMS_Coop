import React, { useCallback, useEffect, useState } from 'react';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { supabase } from '../../../lib/supabase';

const Ledger = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [entries, setEntries] = useState([]);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [ledgerError, setLedgerError] = useState('');

  const fetchAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('is_active', true)
      .order('account_name');

    if (error) {
      console.error('Unable to load ledger accounts:', error);
      setLedgerError('Accounts could not be loaded. Please try again.');
      setLoadingAccounts(false);
      return;
    }

    setAccounts(data || []);
    setSelectedAccount((current) => current || data?.find((account) => account.account_name === 'Loan Receivable')?.id || data?.[0]?.id || '');
    setLoadingAccounts(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useRealtimeSubscription('chart_of_accounts', fetchAccounts, null, [fetchAccounts]);

  const fetchLedger = useCallback(async () => {
    if (!selectedAccount) {
      setEntries([]);
      setBalance(0);
      return;
    }

    setLoadingEntries(true);
    setLedgerError('');
    try {
      const { data: lines, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('id, debit_amount, credit_amount, description, journal_entry_id')
        .eq('account_id', selectedAccount);
      if (linesError) throw linesError;

      const journalIds = [...new Set((lines || []).map((line) => line.journal_entry_id))];
      if (journalIds.length === 0) {
        setEntries([]);
        setBalance(0);
        return;
      }

      const { data: journals, error: journalsError } = await supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, status')
        .in('id', journalIds)
        .eq('status', 'posted');
      if (journalsError) throw journalsError;

      const journalById = new Map((journals || []).map((journal) => [journal.id, journal]));
      const account = accounts.find((item) => item.id === selectedAccount);
      const normalDebit = ['asset', 'expense'].includes(account?.account_type);
      let runningBalance = 0;
      const ledgerEntries = (lines || [])
        .filter((line) => journalById.has(line.journal_entry_id))
        .map((line) => ({ line, journal: journalById.get(line.journal_entry_id) }))
        .sort((first, second) => new Date(first.journal.entry_date) - new Date(second.journal.entry_date))
        .map(({ line, journal }) => {
          const debit = Number(line.debit_amount) || 0;
          const credit = Number(line.credit_amount) || 0;
          runningBalance += normalDebit ? debit - credit : credit - debit;
          return {
            id: line.id,
            entryId: journal.id,
            date: new Date(`${journal.entry_date}T00:00:00`).toLocaleDateString('en-PH'),
            reference: journal.entry_number,
            particulars: line.description || journal.description,
            status: journal.status,
            debit,
            credit,
            balance: runningBalance
          };
        });

      setEntries(ledgerEntries);
      setBalance(runningBalance);
    } catch (error) {
      console.error('Unable to load ledger entries:', error);
      setLedgerError('Ledger entries could not be loaded. Please try again.');
    } finally {
      setLoadingEntries(false);
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  useRealtimeSubscription('journal_entry_lines', fetchLedger, null, [fetchLedger]);
  useRealtimeSubscription('journal_entries', fetchLedger, null, [fetchLedger]);

  const formatAmount = (amount) => amount === 0 ? '-' : `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Ledger</strong> – Account-specific record showing all debits, credits, and running balance.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm lg:text-base min-w-[200px]"
              disabled={loadingAccounts}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.account_name}</option>
              ))}
            </select>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Current Balance</p>
            <p className="text-2xl lg:text-3xl font-bold text-purple-600">
              {formatAmount(balance)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Particulars</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => {
                const isExpanded = expandedEntryId === entry.entryId;
                return (
                  <React.Fragment key={entry.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{entry.date}</td>
                      <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedEntryId(isExpanded ? null : entry.entryId)}
                          className="rounded text-purple-700 underline decoration-purple-300 underline-offset-2 hover:text-purple-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                        >
                          {entry.reference}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{entry.particulars}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.debit)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">{formatAmount(entry.credit)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                        {formatAmount(entry.balance)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-purple-50/60">
                        <td colSpan={6} className="px-4 py-4">
                          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <div><dt className="font-semibold text-gray-600">Entry number</dt><dd className="mt-1 text-gray-900">{entry.reference}</dd></div>
                            <div><dt className="font-semibold text-gray-600">Date</dt><dd className="mt-1 text-gray-900">{entry.date}</dd></div>
                            <div><dt className="font-semibold text-gray-600">Status</dt><dd className="mt-1 capitalize text-gray-900">{entry.status}</dd></div>
                            <div><dt className="font-semibold text-gray-600">Debit / credit</dt><dd className="mt-1 text-gray-900">{formatAmount(entry.debit)} / {formatAmount(entry.credit)}</dd></div>
                            <div className="sm:col-span-2 lg:col-span-4"><dt className="font-semibold text-gray-600">Particulars</dt><dd className="mt-1 text-gray-900">{entry.particulars}</dd></div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {ledgerError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{ledgerError}</p>}
        {loadingEntries && <p className="py-8 text-center text-sm text-gray-500">Loading ledger entries...</p>}
        {!loadingEntries && entries.length === 0 && !ledgerError && (
          <div className="text-center py-12">
            <p className="text-gray-500">No posted entries for this account.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Ledger;

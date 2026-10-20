import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const Table = ({ title, rows, cashSide }) => (
  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <h3 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">{title}</h3>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Transaction</th>
            <th className="px-4 py-2">Debit</th>
            <th className="px-4 py-2">Credit</th>
            <th className="px-4 py-2">Member record</th>
            <th className="px-4 py-2">Treatment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const counter = row.account?.account_name || '';
            const cash = 'Cash on Hand / Cash in Bank';
            return (
              <tr key={row.id}>
                <td className="px-4 py-2 font-medium text-gray-900">{row.label}</td>
                <td className="px-4 py-2">{row.counter_side === 'debit' ? counter : cash}</td>
                <td className="px-4 py-2">{row.counter_side === 'credit' ? counter : cash}</td>
                <td className="px-4 py-2 text-gray-600">{row.member_effect || '-'}</td>
                <td className="px-4 py-2 text-gray-600">{row.notes}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No mappings configured.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">{cashSide}</p>
  </div>
);

const PostingRules = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase
      .from('transaction_account_mappings')
      .select('id, document, transaction_type, label, counter_side, member_effect, notes, sort_order, account:chart_of_accounts(account_name)')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error: queryError }) => {
        if (!active) return;
        setError(queryError ? getDataLoadErrorMessage(queryError, 'posting rules') : '');
        setRows(data || []);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        This is a read-only reference for the configured account mappings. Transaction RPCs currently build and validate their journal lines directly; changing this reference table does not change how transactions are posted.
        Each saved receipt or disbursement is still checked by the database posting workflow.
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <Table title="Receipt Mapping Reference" rows={rows.filter((row) => row.document === 'receipt')} cashSide="Reference only: the transaction RPC validates and posts the actual receipt allocations." />
      <Table title="Disbursement Mapping Reference" rows={rows.filter((row) => row.document === 'disbursement')} cashSide="Reference only: the transaction RPC validates and posts the actual disbursement allocations." />
    </div>
  );
};

export default PostingRules;

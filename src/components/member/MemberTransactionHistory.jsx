import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import EmptyState from '../common/EmptyState';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const statusStyles = {
  Submitted: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Declined: 'bg-red-100 text-red-800',
  Completed: 'bg-blue-100 text-blue-800'
};

const MemberTransactionHistory = () => {
  const { staff } = useAuth();
  const [filter, setFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    const memberId = staff?.member_id;
    if (!memberId) {
      setLoading(false);
      return;
    }

    try {
      const items = [];

      const { data: requests } = await supabase
        .from('requests')
        .select('id, amount, status, created_at, reviewed_at, updated_at')
        .eq('member_id', memberId)
        .eq('request_type', 'loan_application');

      (requests || []).forEach((request) => {
        items.push({ id: `${request.id}-applied`, rawDate: request.created_at, type: 'Applied for loan', category: 'Loan', amount: Number(request.amount), signed: false, status: 'Submitted' });
        if (request.status === 'approved' || request.status === 'rejected') {
          const approved = request.status === 'approved';
          items.push({
            id: `${request.id}-${request.status}`,
            rawDate: request.reviewed_at || request.updated_at,
            type: approved ? 'Loan approved' : 'Loan request declined',
            category: 'Loan',
            amount: Number(request.amount),
            signed: false,
            status: approved ? 'Approved' : 'Declined'
          });
        }
      });

      const { data: accounts } = await supabase.from('savings_accounts').select('id').eq('member_id', memberId);
      if (accounts?.length) {
        const { data: savings } = await supabase
          .from('savings_transactions')
          .select('id, transaction_type, amount, transaction_date')
          .in('savings_account_id', accounts.map((account) => account.id));
        (savings || []).forEach((txn) => {
          const deposit = txn.transaction_type === 'deposit';
          items.push({ id: `savings-${txn.id}`, rawDate: txn.transaction_date, type: deposit ? 'Savings deposit' : 'Savings withdrawal', category: 'Savings', amount: deposit ? Number(txn.amount) : -Number(txn.amount), signed: true, status: 'Completed' });
        });
      }

      const { data: loans } = await supabase.from('loans').select('id').eq('member_id', memberId);
      if (loans?.length) {
        const { data: payments } = await supabase
          .from('loan_payments')
          .select('id, payment_date, amount_paid')
          .in('loan_id', loans.map((loan) => loan.id));
        (payments || []).forEach((payment) => {
          items.push({ id: `loan-${payment.id}`, rawDate: payment.payment_date, type: 'Loan payment', category: 'Loan', amount: -Number(payment.amount_paid), signed: true, status: 'Completed' });
        });
      }

      items.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
      setTransactions(items);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [staff?.member_id]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useMultipleRealtimeSubscriptions([
    { table: 'requests', onUpdate: fetchTransactions },
    { table: 'savings_transactions', onUpdate: fetchTransactions },
    { table: 'loan_payments', onUpdate: fetchTransactions }
  ], [fetchTransactions]);

  const filtered = transactions.filter((t) => {
    if (filter !== 'all' && t.category.toLowerCase() !== filter) return false;
    if (dateFrom && new Date(t.rawDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(t.rawDate) > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-sm font-medium text-gray-700">
          Category
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="all">All</option>
            <option value="savings">Savings</option>
            <option value="loan">Loan</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-gray-700">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-500">Loading transactions...</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<span className="text-3xl">📄</span>}
            title="No Transactions Found"
            description="Loan applications, approvals, savings and loan payments will appear here."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.type}</p>
                  <p className="text-xs text-gray-500">{fmtDate(t.rawDate)} · {t.category}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${!t.signed ? 'text-gray-900' : t.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t.signed && t.amount > 0 ? '+' : ''}{t.signed && t.amount < 0 ? '-' : ''}{peso(Math.abs(t.amount))}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[t.status]}`}>{t.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MemberTransactionHistory;

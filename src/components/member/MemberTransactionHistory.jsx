import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import EmptyState from '../common/EmptyState';
import PrintableReceipt from '../common/PrintableReceipt';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const officialReceiptNumber = (value) => /^AMCOMS-\d{4}-\d{6}$/.test(value || '') ? value : null;

const statusStyles = {
  Recorded: 'bg-green-100 text-green-800',
  Discrepancy: 'bg-red-100 text-red-800',
  Completed: 'bg-green-100 text-green-800',
  Voided: 'bg-gray-100 text-gray-700'
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

      const { data: activity } = await supabase
        .from('member_activity')
        .select('id, activity_type, title, amount, created_at, is_discrepancy, note, reference, voided_at, void_reason')
        .eq('member_id', memberId);
      const dividendReferences = new Set(
        (activity || []).filter((row) => row.activity_type === 'dividend').map((row) => row.reference)
      );

      (activity || []).forEach((row) => {
        if (row.activity_type === 'dividend') return;
        items.push({
          id: `activity-${row.id}`,
          rawDate: row.created_at,
          type: row.title,
          category: /loan/i.test(row.activity_type) ? 'Loan' : 'Other',
          amount: Number(row.amount || 0),
          signed: false,
          status: row.voided_at ? 'Voided' : row.is_discrepancy ? 'Discrepancy' : 'Recorded',
          receiptNumber: officialReceiptNumber(row.reference),
          note: row.void_reason || row.note
        });
      });

      const { data: dividends, error: dividendError } = await supabase
        .from('member_dividend_distributions')
        .select('id, reference_number, distribution_date, dividend_amount, patronage_amount, mortuary_deduction, retention_amount, savings_amount, loan_payment_amount')
        .eq('member_id', memberId);
      if (dividendError) throw dividendError;
      (dividends || []).forEach((distribution) => {
        const gross = Number(distribution.dividend_amount) + Number(distribution.patronage_amount);
        items.push({
          id: `dividend-${distribution.id}`,
          rawDate: distribution.distribution_date,
          type: 'Dividend and patronage distribution',
          category: 'Other',
          amount: gross - Number(distribution.mortuary_deduction),
          signed: false,
          status: 'Completed',
          details: `Dividend ₱${Number(distribution.dividend_amount).toFixed(2)} · Patronage ₱${Number(distribution.patronage_amount).toFixed(2)} · Mortuary ₱${Number(distribution.mortuary_deduction).toFixed(2)} · Capital share ₱${Number(distribution.retention_amount).toFixed(2)} · Savings ₱${Number(distribution.savings_amount).toFixed(2)} · Loan ₱${Number(distribution.loan_payment_amount).toFixed(2)}`
        });
      });

      const { data: accounts } = await supabase.from('savings_accounts').select('id, account_type').eq('member_id', memberId);
      if (accounts?.length) {
        const { data: savings } = await supabase
          .from('savings_transactions')
          .select('id, transaction_type, amount, transaction_date, savings_account_id, reference_number, status, void_reason')
          .in('savings_account_id', accounts.map((account) => account.id));
        (savings || []).filter((txn) => !dividendReferences.has(txn.reference_number)).forEach((txn) => {
          const account = accounts.find(a => a.id === txn.savings_account_id);
          const isTimeDeposit = account?.account_type === 'time_deposit';
          const deposit = txn.transaction_type === 'deposit';
          items.push({ 
            id: `savings-${txn.id}`, 
            rawDate: txn.transaction_date, 
            type: isTimeDeposit ? (deposit ? 'Time deposit' : 'Time deposit withdrawal') : (deposit ? 'Savings deposit' : 'Savings withdrawal'), 
            category: isTimeDeposit ? 'Time Deposit' : 'Savings', 
            amount: deposit ? Number(txn.amount) : -Number(txn.amount), 
            signed: true, 
            status: txn.status === 'void' ? 'Voided' : 'Completed',
            receiptNumber: officialReceiptNumber(txn.reference_number),
            note: txn.void_reason
          });
        });
      }

      const { data: loans } = await supabase.from('loans').select('id').eq('member_id', memberId);
      if (loans?.length) {
        const { data: payments } = await supabase
          .from('loan_payments')
          .select('id, payment_date, amount_paid, receipt_id, reference_number')
          .in('loan_id', loans.map((loan) => loan.id))
          .eq('status', 'recorded');
        (payments || []).filter((payment) => !payment.receipt_id && !dividendReferences.has(payment.reference_number)).forEach((payment) => {
          items.push({
            id: `loan-${payment.id}`,
            rawDate: payment.payment_date,
            type: 'Loan payment',
            category: 'Loan',
            amount: -Number(payment.amount_paid),
            signed: true,
            status: 'Completed',
            receiptNumber: officialReceiptNumber(payment.reference_number)
          });
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
    { table: 'member_activity', onUpdate: fetchTransactions },
    { table: 'savings_transactions', onUpdate: fetchTransactions },
    { table: 'loan_payments', onUpdate: fetchTransactions },
    { table: 'member_dividend_distributions', onUpdate: fetchTransactions }
  ], [fetchTransactions]);

  const filtered = transactions.filter((t) => {
    if (filter !== 'all' && t.category.toLowerCase() !== filter) return false;
    if (dateFrom && new Date(t.rawDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(t.rawDate) > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 grid-cols-1 gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
        <label className="min-w-0 text-sm font-medium text-gray-700">
          Category
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 box-border block min-w-0 w-full max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
            <option value="all">All</option>
            <option value="savings">Savings</option>
            <option value="time deposit">Time Deposit</option>
            <option value="loan">Loan</option>
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium text-gray-700">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 box-border block min-w-0 w-full max-w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2" />
        </label>
        <label className="min-w-0 text-sm font-medium text-gray-700">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 box-border block min-w-0 w-full max-w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2" />
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-500">Loading transactions...</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<span className="text-3xl">📄</span>}
            title="No Transactions Found"
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.type}</p>
                  <p className="text-xs text-gray-500">{fmtDate(t.rawDate)} · {t.category}</p>
                  {t.receiptNumber && <p className="mt-1 text-xs font-medium text-green-800">Official receipt: {t.receiptNumber}</p>}
                  {t.details && <p className="mt-1 text-xs text-gray-600">{t.details}</p>}
                  {t.note && <p className="mt-1 text-xs text-red-700">Reason: {t.note}</p>}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${!t.signed ? 'text-gray-900' : t.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t.signed && t.amount > 0 ? '+' : ''}{t.signed && t.amount < 0 ? '-' : ''}{peso(Math.abs(t.amount))}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[t.status]}`}>{t.status}</span>
                  {t.receiptNumber && (
                    <div className="mt-2">
                      <PrintableReceipt
                        receiptNumber={t.receiptNumber}
                        date={t.rawDate}
                        issuedTo={staff?.full_name}
                        description={t.type}
                        amount={t.amount}
                        status={t.status}
                        documentType="receipt"
                      />
                    </div>
                  )}
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

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const statusStyle = {
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-700'
};

const MyLoans = () => {
  const { staff } = useAuth();
  const [loans, setLoans] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!staff?.member_id) return;
    const { data: loanRows } = await supabase
      .from('loans')
      .select('id, loan_number, principal_amount, interest_rate, term_months, total_amount, balance, status, payment_frequency, installments, installment_amount, penalty_rate, penalty_total, maturity_date, notes')
      .eq('member_id', staff.member_id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false });
    setLoans(loanRows || []);

    if (loanRows?.length) {
      const { data: rows } = await supabase
        .from('loan_schedule')
        .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status')
        .in('loan_id', loanRows.map((loan) => loan.id))
        .order('installment_number');
      const grouped = {};
      (rows || []).forEach((row) => { (grouped[row.loan_id] ||= []).push(row); });
      setSchedule(grouped);
    }
    setLoading(false);
  }, [staff?.member_id]);

  useEffect(() => { load(); }, [load]);
  useMultipleRealtimeSubscriptions([
    { table: 'loans', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'loan_schedule', onUpdate: load }
  ], [load]);

  if (loading) return <p className="py-6 text-center text-sm text-gray-500">Loading...</p>;
  if (!loans.length) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">You have no active loans. Approved loan requests will appear here automatically.</p>;
  }

  return (
    <div className="space-y-6">
      {loans.map((loan) => {
        const rows = schedule[loan.id] || [];
        const next = rows.find((row) => row.status !== 'paid');
        const paidCount = rows.filter((row) => row.status === 'paid').length;
        const progress = rows.length ? Math.round((paidCount / rows.length) * 100) : 0;
        return (
          <section key={loan.id} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">{loan.loan_number}{loan.status === 'completed' ? ' · Fully paid' : ''}</p>
                <p className="text-sm text-gray-500">Remaining balance</p>
                <p className="text-3xl font-bold text-orange-600">{peso(loan.balance)}</p>
              </div>
              {next && (
                <div className="rounded-lg bg-orange-50 px-3 py-2 text-right">
                  <p className="text-xs text-orange-700">Next due</p>
                  <p className="text-sm font-semibold text-orange-900">{fmtDate(next.due_date)}</p>
                  <p className="text-xs text-orange-700">{peso(Number(next.amount_due) + Number(next.penalty_amount) - Number(next.amount_paid))}</p>
                </div>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">Loan amount</dt><dd className="font-medium">{peso(loan.principal_amount)}</dd></div>
              <div><dt className="text-gray-500">Total to pay</dt><dd className="font-medium">{peso(loan.total_amount)}</dd></div>
              <div><dt className="text-gray-500">Term</dt><dd className="font-medium">{loan.term_months / 12} yr · {loan.payment_frequency}</dd></div>
              <div><dt className="text-gray-500">Interest</dt><dd className="font-medium">{loan.interest_rate}% per year</dd></div>
              <div><dt className="text-gray-500">Each payment</dt><dd className="font-medium">{peso(loan.installment_amount)}</dd></div>
              <div><dt className="text-gray-500">Late charge</dt><dd className="font-medium">{loan.penalty_rate}% of missed payment</dd></div>
              {Number(loan.penalty_total) > 0 && (
                <div className="col-span-2"><dt className="text-gray-500">Late charges added</dt><dd className="font-medium text-red-600">{peso(loan.penalty_total)}</dd></div>
              )}
            </dl>

            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>{paidCount} of {rows.length} payments made</span><span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-orange-500" style={{ width: `${progress}%` }} /></div>
            </div>

            {rows.length > 0 && (
              <details className="rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-800">Payment schedule</summary>
                <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-gray-700">#{row.installment_number} · {fmtDate(row.due_date)}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{peso(Number(row.amount_due) + Number(row.penalty_amount))}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusStyle[row.status]}`}>{row.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
      <p className="text-xs text-gray-500">Payments are made at the cooperative office. You will get SMS reminders 7, 3 and 1 day before each due date.</p>
    </div>
  );
};

export default MyLoans;

import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, CheckCircle, Clock, Award } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { 
  minimumFractionDigits: 2, 
  maximumFractionDigits: 2 
})}`;

const fmtDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const MSOLoans = () => {
  const { staff } = useAuth();
  const [loanData, setLoanData] = useState({
    activeLoans: [],
    completedLoans: [],
    payments: [],
    schedule: {},
    performance: {
      totalPaid: 0,
      onTimePayments: 0,
      latePayments: 0,
      missedPayments: 0,
      paymentScore: 100
    }
  });
  const [loading, setLoading] = useState(true);
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!staff?.member_id) {
      setLoadError('Your member profile is not linked to a member record.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      // Fetch all loans
      const { data: loans, error: loanError } = await supabase
        .from('loans')
        .select(`
          id, loan_number, principal_amount, interest_rate, term_months, 
          total_amount, balance, status, payment_frequency, installments, 
          installment_amount, penalty_rate, penalty_total, release_date, 
          maturity_date, notes
        `)
        .eq('member_id', staff.member_id)
        .order('created_at', { ascending: false });

      if (loanError) throw loanError;

      const activeLoans = loans?.filter(l => l.status === 'active') || [];
      const completedLoans = loans?.filter(l => l.status === 'completed') || [];

      // Fetch payment schedule
      let schedule = {};
      if (loans && loans.length > 0) {
        const { data: scheduleRows, error: schedError } = await supabase
          .from('loan_schedule')
          .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status')
          .in('loan_id', loans.map(l => l.id))
          .order('installment_number');

        if (schedError) throw schedError;

        (scheduleRows || []).forEach(row => {
          if (!schedule[row.loan_id]) schedule[row.loan_id] = [];
          schedule[row.loan_id].push(row);
        });
      }

      // Fetch all loan payments
      let payments = [];
      if (loans && loans.length > 0) {
        const { data: paymentRows, error: payError } = await supabase
          .from('loan_payments')
          .select(`
            id, loan_id, payment_date, amount_paid, principal_paid, 
            interest_paid, penalty_paid, balance_after, payment_method, 
            reference_number, loans!inner(loan_number)
          `)
          .in('loan_id', loans.map(l => l.id))
          .eq('status', 'recorded')
          .order('payment_date', { ascending: false });

        if (payError) throw payError;
        payments = paymentRows || [];
      }

      // Calculate payment performance
      let onTimePayments = 0;
      let latePayments = 0;
      let missedPayments = 0;

      Object.values(schedule).flat().forEach(installment => {
        if (installment.status === 'paid') {
          // Check if penalty was applied (indicates late payment)
          if (Number(installment.penalty_amount) > 0) {
            latePayments++;
          } else {
            onTimePayments++;
          }
        } else if (installment.status === 'overdue') {
          missedPayments++;
        }
      });

      const totalScheduledPayments = onTimePayments + latePayments + missedPayments;
      const paymentScore = totalScheduledPayments > 0
        ? Math.round(((onTimePayments * 100 + latePayments * 50) / (totalScheduledPayments * 100)) * 100)
        : 100;

      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

      setLoanData({
        activeLoans,
        completedLoans,
        payments,
        schedule,
        performance: {
          totalPaid,
          onTimePayments,
          latePayments,
          missedPayments,
          paymentScore
        }
      });
      setLoadError('');
    } catch (error) {
      console.error('Error loading loan data:', error);
      setLoadError('We couldn’t load your loan details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [staff?.member_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time subscriptions
  useMultipleRealtimeSubscriptions([
    { table: 'loans', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'loan_schedule', onUpdate: load }
  ], [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
          <p className="mt-3 text-sm text-gray-600">Loading loan information...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
        <p className="font-semibold">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 min-h-10 rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const hasLoans = loanData.activeLoans.length > 0 || loanData.completedLoans.length > 0;

  if (!hasLoans) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No Active Loans</h3>
          <p className="mt-2 text-sm text-gray-600">
            Your loan details will appear here after a Manager approves the application and the Bookkeeper records the cash release.
          </p>
        </div>
      </div>
    );
  }

  // Payment performance rating
  const getPerformanceRating = (score) => {
    if (score >= 95) return { text: 'Excellent', color: 'emerald', icon: Award };
    if (score >= 85) return { text: 'Very Good', color: 'green', icon: CheckCircle };
    if (score >= 70) return { text: 'Good', color: 'blue', icon: TrendingUp };
    if (score >= 50) return { text: 'Fair', color: 'yellow', icon: Clock };
    return { text: 'Needs Improvement', color: 'red', icon: AlertCircle };
  };

  const rating = getPerformanceRating(loanData.performance.paymentScore);
  const PerformanceIcon = rating.icon;

  return (
    <div className="space-y-6">
      {/* Account Performance Card */}
      {(loanData.performance.onTimePayments > 0 || loanData.performance.latePayments > 0) && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                  <PerformanceIcon className="h-6 w-6 text-white" />
                </div>
                <div className="text-white">
                  <p className="text-sm font-medium">Payment Performance</p>
                  <p className="text-2xl font-bold">{rating.text}</p>
                </div>
              </div>
              <div className="text-right text-white">
                <p className="text-3xl font-bold">{loanData.performance.paymentScore}</p>
                <p className="text-xs">Score</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{loanData.performance.onTimePayments}</p>
              <p className="mt-1 text-xs text-gray-600">On-Time Payments</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{loanData.performance.latePayments}</p>
              <p className="mt-1 text-xs text-gray-600">Late Payments</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-600">{loanData.performance.missedPayments}</p>
              <p className="mt-1 text-xs text-gray-600">Overdue</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{peso(loanData.performance.totalPaid, 0)}</p>
              <p className="mt-1 text-xs text-gray-600">Total Paid</p>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
            <p className="text-xs text-gray-600">
              {loanData.performance.paymentScore >= 95 
                ? '🎉 Outstanding payment record! Keep up the excellent work.'
                : loanData.performance.paymentScore >= 85
                ? '👍 Great payment history. Your reliability is appreciated.'
                : loanData.performance.paymentScore >= 70
                ? '✓ Good payment record. Continue paying on time.'
                : '⚠️ Please ensure timely payments to maintain a good standing.'}
            </p>
          </div>
        </div>
      )}

      {/* Active Loans */}
      {loanData.activeLoans.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Active Loans</h3>
          
          {loanData.activeLoans.map((loan) => {
            const schedule = loanData.schedule[loan.id] || [];
            const nextDue = schedule.find(s => s.status !== 'paid');
            const paidCount = schedule.filter(s => s.status === 'paid').length;
            const progress = schedule.length > 0 ? Math.round((paidCount / schedule.length) * 100) : 0;
            const isExpanded = expandedLoan === loan.id;

            return (
              <div key={loan.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{loan.loan_number}</h4>
                      <p className="mt-1 text-sm text-gray-600">
                        {loan.term_months / 12} year term · {loan.payment_frequency} payments
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Balance Display */}
                  <div className="mb-5">
                    <p className="text-sm text-gray-600">Remaining Balance</p>
                    <p className="mt-1 text-3xl font-bold text-orange-600">{peso(loan.balance)}</p>
                  </div>

                  {/* Loan Details Grid */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs text-gray-600">Principal (without interest)</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{peso(loan.principal_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Installment</p>
                      {nextDue ? (
                        <>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {peso(Number(nextDue.amount_due) + Number(nextDue.penalty_amount) - Number(nextDue.amount_paid))} · #{nextDue.installment_number}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">Due {fmtDate(nextDue.due_date)}</p>
                        </>
                      ) : <p className="mt-1 text-sm font-semibold text-gray-900">{peso(loan.installment_amount)}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total Interest</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{peso(Math.max(Number(loan.total_amount || 0) - Number(loan.principal_amount || 0), 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Interest Rate</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{loan.interest_rate}% p.a.</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total Amount</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{peso(loan.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Maturity Date</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{fmtDate(loan.maturity_date)}</p>
                    </div>
                    {Number(loan.penalty_total) > 0 && (
                      <div>
                        <p className="text-xs text-gray-600">Late Charges</p>
                        <p className="mt-1 text-sm font-semibold text-rose-600">{peso(loan.penalty_total)}</p>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-5">
                    <div className="mb-1 flex justify-between text-xs text-gray-600">
                      <span>{paidCount} of {schedule.length} payments completed</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500" 
                        style={{ width: `${progress}%` }} 
                      />
                    </div>
                  </div>

                  {/* Toggle Schedule Button */}
                  <button
                    onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                    className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {isExpanded ? 'Hide Payment Schedule' : 'View Payment Schedule'}
                  </button>

                  {/* Payment Schedule (Expandable) */}
                  {isExpanded && schedule.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-200">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Due Date</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Amount</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {schedule.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-900">{item.installment_number}</td>
                                <td className="px-3 py-2 text-gray-900">{fmtDate(item.due_date)}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">
                                  {peso(Number(item.amount_due) + Number(item.penalty_amount))}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                    item.status === 'paid' 
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : item.status === 'overdue'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment History */}
      {loanData.payments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Loan</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Principal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Interest</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Penalty</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Total Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loanData.payments.slice(0, 20).map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {fmtDate(payment.payment_date)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {payment.loans?.loan_number || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                      {peso(payment.principal_paid)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                      {peso(payment.interest_paid)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-rose-600">
                      {Number(payment.penalty_paid) > 0 ? peso(payment.penalty_paid) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      {peso(payment.amount_paid)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-orange-600">
                      {peso(payment.balance_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed Loans */}
      {loanData.completedLoans.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="text-sm font-semibold text-gray-900">Completed Loans</h4>
          <p className="mt-2 text-xs text-gray-600">
            You have successfully completed {loanData.completedLoans.length} {loanData.completedLoans.length === 1 ? 'loan' : 'loans'}. 
            Excellent payment history!
          </p>
        </div>
      )}

      {/* Info Footer */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-900">
          <span className="font-semibold">Payment Reminder:</span> Payments are made at the cooperative office. 
          You will receive SMS reminders before each due date. Please ensure timely payments to avoid penalties.
        </p>
      </div>
    </div>
  );
};

export default MSOLoans;

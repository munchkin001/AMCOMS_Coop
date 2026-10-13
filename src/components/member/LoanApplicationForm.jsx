import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const statusText = (status) => status.replaceAll('_', ' ');

const LoanApplicationForm = () => {
  const { staff } = useAuth();
  const [terms, setTerms] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loanType, setLoanType] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTerm = terms.find((term) => term.id === termId) || terms[0];
  const amountNumber = Number(amount);
  const quote = useMemo(() => {
    if (!selectedTerm || !Number.isFinite(amountNumber) || amountNumber <= 0) return null;
    const installments = selectedTerm.payment_frequency === 'weekly'
      ? Math.round(selectedTerm.term_months * 52 / 12)
      : selectedTerm.term_months;
    const interest = Math.round(amountNumber * Number(selectedTerm.annual_rate) / 100 * selectedTerm.term_months / 12 * 100) / 100;
    const total = amountNumber + interest;
    return { interest, total, installment: Math.round(total / installments * 100) / 100 };
  }, [amountNumber, selectedTerm]);

  const load = useCallback(async () => {
    try {
      const [termsResult, applicationsResult] = await Promise.all([
        supabase.from('loan_term_options')
          .select('id, term_months, payment_frequency, annual_rate, penalty_rate')
          .eq('is_active', true)
          .order('term_months')
          .order('payment_frequency'),
        supabase.from('requests')
          .select('id, request_number, status, amount, request_data, created_at, review_notes, approval_notes')
          .eq('request_type', 'loan_application')
          .order('created_at', { ascending: false })
          .limit(100)
      ]);
      if (termsResult.error) throw termsResult.error;
      if (applicationsResult.error) throw applicationsResult.error;
      setError('');
      setTerms(termsResult.data || []);
      setApplications(applicationsResult.data || []);
    } catch (loadError) {
      console.error('Unable to load loan application options:', loadError);
      setError(`Loan application information could not be loaded: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSubscription(
    'requests',
    load,
    staff?.member_id ? { column: 'member_id', value: staff.member_id } : null,
    [load],
    Boolean(staff?.member_id)
  );

  const hasOpenApplication = applications.some((application) =>
    ['pending', 'under_review'].includes(application.status)
  );

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!loanType.trim() || !purpose.trim() || !selectedTerm || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Enter the loan type, amount, purpose, and repayment terms.');
      return;
    }
    if (hasOpenApplication) {
      setError('You already have a loan application being reviewed.');
      return;
    }

    setSaving(true);
    try {
      const { error: submitError } = await supabase.rpc('submit_loan_request', {
        p_amount: amountNumber,
        p_loan_type: loanType.trim(),
        p_purpose: purpose.trim(),
        p_term_months: selectedTerm.term_months,
        p_frequency: selectedTerm.payment_frequency
      });
      if (submitError) throw submitError;
      setAmount('');
      setLoanType('');
      setPurpose('');
      setNotice('Your loan application was submitted for Manager review.');
      await load();
    } catch (submitError) {
      console.error('Unable to submit loan application:', submitError);
      setError(submitError.message || 'Your loan application could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Loan Applications</h2>
        <p className="mt-1 text-sm text-gray-600">Submit a request for Manager review. If approved, the Bookkeeper records the cash release before repayment begins.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      {applications.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">Your requests</h3>
          {applications.map((application) => (
            <article key={application.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="font-medium text-gray-900">{application.request_number} · {money(application.amount)}</p>
                <p className="mt-1 text-xs text-gray-600">{application.request_data?.loan_type || 'Loan'} · {new Date(application.created_at).toLocaleDateString('en-PH')}</p>
                {(application.review_notes || application.approval_notes) && <p className="mt-2 text-sm text-gray-700">{application.approval_notes || application.review_notes}</p>}
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-900">{statusText(application.status)}</span>
            </article>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading application options...</p> : (
        <form onSubmit={submit} className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Loan type *
            <input value={loanType} onChange={(event) => setLoanType(event.target.value)} maxLength={60} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Amount requested (₱) *
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Purpose *
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} rows={3} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Repayment terms *
            <select value={termId || terms[0]?.id || ''} onChange={(event) => setTermId(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              {terms.map((term) => <option key={term.id} value={term.id}>{term.term_months} months · {term.payment_frequency} · {term.annual_rate}% annual interest</option>)}
            </select>
          </label>
          {terms.length === 0 && <p role="alert" className="text-sm text-amber-800 sm:col-span-2">No loan terms are currently available. Please contact the cooperative office.</p>}
          {quote && (
            <div className="grid gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2 sm:grid-cols-3">
              <p>Estimated interest <strong className="block">{money(quote.interest)}</strong></p>
              <p>Estimated total repayment <strong className="block">{money(quote.total)}</strong></p>
              <p>Estimated installment <strong className="block">{money(quote.installment)}</strong></p>
              <p className="text-xs text-blue-800 sm:col-span-3">Estimate only; final terms are confirmed by the Manager under cooperative policy.</p>
            </div>
          )}
          {hasOpenApplication && <p className="text-sm text-amber-800 sm:col-span-2"><Clock3 aria-hidden="true" className="mr-1 inline" size={16} />You have an application awaiting review. You can submit another after a decision.</p>}
          <button type="submit" disabled={saving || hasOpenApplication || terms.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
            <Send aria-hidden="true" size={16} />
            {saving ? 'Submitting...' : 'Submit loan application'}
          </button>
        </form>
      )}
    </section>
  );
};

export default LoanApplicationForm;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, HandCoins, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import offlineDb from '../../lib/Offline/OfflineDb';
import { getActivityHistory, queueOperation } from '../../lib/Offline/syncQueue';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import {
  loanApplicationFieldClass,
  loanApplicationLabelClass,
} from '../common/loanApplicationStyles';

const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const statusText = (status) => status.replaceAll('_', ' ');
const applicationStatusStyle = (status) => ({
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  under_review: 'bg-amber-100 text-amber-900',
  pending: 'bg-gray-100 text-gray-800',
}[status] || 'bg-gray-100 text-gray-800');

const LoanApplicationForm = () => {
  const { user, staff, offlineMode } = useAuth();
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
  const [queuedApplicationPending, setQueuedApplicationPending] = useState(false);

  const selectedTerm = terms.find((term) => term.id === termId) || terms[0];
  const amountNumber = Number(amount);
  const quote = useMemo(() => {
    if (!selectedTerm || !Number.isFinite(amountNumber) || amountNumber <= 0) return null;
    const installments = selectedTerm.payment_frequency === 'weekly'
      ? Math.round(selectedTerm.term_months * 52 / 12)
      : selectedTerm.term_months;
    const interest = Math.round(amountNumber * Number(selectedTerm.annual_rate) / 100 * selectedTerm.term_months / 12 * 100) / 100;
    const total = amountNumber + interest;
    const installment = Math.round(total / installments * 100) / 100;
    return {
      interest,
      total,
      installment,
    };
  }, [amountNumber, selectedTerm]);

  const load = useCallback(async () => {
    try {
      const cacheKey = user?.id ? `loan-applications:${user.id}` : null;
      const offlineQueue = user?.id
        ? await getActivityHistory({ userId: user.id, module: 'loans' })
        : [];
      setQueuedApplicationPending(offlineQueue.some((operation) =>
        operation.type === 'loan_application' &&
        (['pending', 'syncing'].includes(operation.status) ||
          (operation.status === 'failed' && operation.retryable !== false))
      ));
      if (!navigator.onLine || offlineMode) {
        const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
        if (!cached?.data) throw new Error('No loan terms are saved on this device. Reconnect before preparing an application.');
        setTerms(cached.data.terms || []);
        setApplications(cached.data.applications || []);
        setError('Showing saved loan information. Applications remain pending until the server verifies eligibility and accepts them.');
        return;
      }
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
      if (cacheKey) {
        await offlineDb.cachedData.put({
          key: cacheKey,
          data: { terms: termsResult.data || [], applications: applicationsResult.data || [] },
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (loadError) {
      console.error('Unable to load loan application options:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'loan application information'));
    } finally {
      setLoading(false);
    }
  }, [offlineMode, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshQueuedStatus = () => load();
    window.addEventListener('amcoms-offline-queue-updated', refreshQueuedStatus);
    return () => window.removeEventListener('amcoms-offline-queue-updated', refreshQueuedStatus);
  }, [load]);

  useRealtimeSubscription(
    'requests',
    load,
    staff?.member_id ? { column: 'member_id', value: staff.member_id } : null,
    [load],
    Boolean(staff?.member_id)
  );

  const hasOpenApplication = queuedApplicationPending || applications.some((application) =>
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
      const payload = {
        p_amount: amountNumber,
        p_loan_type: loanType.trim(),
        p_purpose: purpose.trim(),
        p_term_months: selectedTerm.term_months,
        p_frequency: selectedTerm.payment_frequency
      };
      if (!navigator.onLine || offlineMode) {
        await queueOperation({
          type: 'loan_application',
          payload,
          userId: user?.id,
          actorRole: staff?.role || 'member',
          actorName: staff?.full_name || null,
          allowLocalQueue: true,
          summary: 'Loan application submitted for server validation',
          details: {
            amount: amountNumber,
            termMonths: selectedTerm.term_months,
            paymentFrequency: selectedTerm.payment_frequency,
            localRecordedAt: new Date().toISOString(),
          },
        });
        setQueuedApplicationPending(true);
        setNotice('Your loan application is saved on this device as pending. It is not submitted for review yet; the server must validate it after you reconnect.');
        return;
      }
      const { error: submitError } = await supabase.rpc('submit_loan_request', payload);
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-5 sm:px-7">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
          <HandCoins aria-hidden="true" size={22} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Member services</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Loan applications</h2>
          <p className="mt-1 text-sm text-slate-600">Review your requests or submit an application for Manager review.</p>
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-7">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

      {applications.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Your requests</h3>
          {applications.map((application) => (
            <article key={application.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <p className="font-semibold text-slate-900">{application.request_number} · {money(application.amount)}</p>
                <p className="mt-1 text-sm text-slate-600">{application.request_data?.loan_type || 'Loan'} · {new Date(application.created_at).toLocaleDateString('en-PH')}</p>
                {(application.review_notes || application.approval_notes) && <p className="mt-2 text-sm leading-5 text-slate-700">{application.approval_notes || application.review_notes}</p>}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${applicationStatusStyle(application.status)}`}>
                {statusText(application.status)}
              </span>
            </article>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-slate-500">Loading application options...</p> : (
        <form onSubmit={submit} className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <label className={loanApplicationLabelClass}>
            Loan type *
            <input value={loanType} onChange={(event) => setLoanType(event.target.value)} maxLength={60} required className={loanApplicationFieldClass} />
          </label>
          <label className={loanApplicationLabelClass}>
            Amount requested (₱) *
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className={loanApplicationFieldClass} />
          </label>
          <label className={`${loanApplicationLabelClass} sm:col-span-2`}>
            Purpose *
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} rows={3} required className={loanApplicationFieldClass} />
          </label>
          <label className={`${loanApplicationLabelClass} sm:col-span-2`}>
            Repayment terms *
            <select value={termId || terms[0]?.id || ''} onChange={(event) => setTermId(event.target.value)} required className={loanApplicationFieldClass}>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.term_months} months · {term.payment_frequency} · {term.annual_rate}% annual interest</option>)}
            </select>
          </label>
          {terms.length === 0 && <p role="alert" className="text-sm text-amber-800 sm:col-span-2">No loan terms are currently available. Please contact the cooperative office.</p>}
          {quote && (
            <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
              <p>Principal <strong className="mt-1 block text-base tabular-nums">{money(amountNumber)}</strong></p>
              <p>Estimated installment <strong className="mt-1 block text-base tabular-nums">{money(quote.installment)}</strong></p>
              <p>Estimated interest <strong className="mt-1 block text-base tabular-nums">{money(quote.interest)}</strong></p>
              <p>Estimated total repayment <strong className="mt-1 block text-base tabular-nums">{money(quote.total)}</strong></p>
            </div>
          )}
          {hasOpenApplication && <p className="text-sm text-amber-800 sm:col-span-2"><Clock3 aria-hidden="true" className="mr-1 inline" size={16} />You have an application awaiting review. You can submit another after a decision.</p>}
          <button type="submit" disabled={saving || hasOpenApplication || terms.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
            <Send aria-hidden="true" size={16} />
            {saving ? 'Submitting...' : 'Submit loan application'}
          </button>
        </form>
      )}
      </div>
    </section>
  );
};

export default LoanApplicationForm;

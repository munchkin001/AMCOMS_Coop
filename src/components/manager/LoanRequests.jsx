import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import LoadingSpinner from '../common/LoadingSpinner';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { queueOperation, getOperation } from '../../lib/Offline/syncQueue';
import { syncPendingOperations } from '../../lib/Offline/syncOperations';

const today = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fullName = (member) => [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
const memberOf = (record) => (Array.isArray(record?.member) ? record.member[0] : record?.member);
const requestData = (request) => request.request_data || {};
const createVoucher = () => `LR-${today().replace(/-/g, '')}-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const loanTypes = ['Regular', 'Agricultural', 'Emergency'];

const LoanReleaseCard = ({ loan, onRelease, busy }) => {
  const [date, setDate] = useState(today());
  const [voucher, setVoucher] = useState(createVoucher);
  const [paymentSource, setPaymentSource] = useState('cash-on-hand');
  const [error, setError] = useState('');
  const member = memberOf(loan);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onRelease({ loanId: loan.id, date, voucher: voucher.trim(), paymentSource });
    } catch (releaseError) {
      setError(releaseError.message || 'The loan disbursement could not be recorded.');
    }
  };

  return (
    <article className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{fullName(member)}</h3>
          <p className="mt-1 text-sm text-gray-600">{loan.loan_number} · Approved {loan.approval_date || 'date unavailable'}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Awaiting disbursement</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <p className="text-sm text-gray-600">Principal <strong className="block text-gray-900">{formatMoney(loan.principal_amount)}</strong></p>
        <p className="text-sm text-gray-600">Total payable <strong className="block text-gray-900">{formatMoney(loan.total_amount)}</strong></p>
        <p className="text-sm text-gray-600">Term <strong className="block text-gray-900">{loan.term_months} months · {loan.payment_frequency}</strong></p>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Release date
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Disbursement voucher *
          <input required value={voucher} onChange={(event) => setVoucher(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Pay from
          <select value={paymentSource} onChange={(event) => setPaymentSource(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
            <option value="cash-on-hand">Cash on Hand</option>
            <option value="cash-in-bank">Cash in Bank</option>
          </select>
        </label>
        {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:col-span-2">
          <Check aria-hidden="true" size={17} />
          {busy ? 'Recording...' : `Record cash release of ${formatMoney(loan.principal_amount)}`}
        </button>
      </form>
    </article>
  );
};

const LoanRequests = () => {
  const { user, staff, offlineMode } = useAuth();
  const canReview = staff?.role === 'manager';
  const canRelease = staff?.role === 'bookkeeper';
  const canViewQueue = ['manager', 'bookkeeper'].includes(staff?.role);
  const [members, setMembers] = useState([]);
  const [terms, setTerms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [approvedLoans, setApprovedLoans] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [memberName, setMemberName] = useState('');
  const [loanType, setLoanType] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [savingApplication, setSavingApplication] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const requestQuery = canViewQueue
        ? supabase
          .from('requests')
          .select('id, request_number, request_type, member_id, status, request_data, amount, created_at, member:members(first_name, middle_name, last_name, member_number)')
          .eq('request_type', 'loan_application')
          .in('status', ['pending', 'under_review'])
          .order('created_at', { ascending: true })
          .limit(500)
        : Promise.resolve({ data: [], error: null });
      const memberQuery = canRelease
        ? supabase.from('members')
          .select('id, first_name, middle_name, last_name, member_number')
          .eq('membership_status', 'active')
          .order('last_name')
        : Promise.resolve({ data: [], error: null });
      const termQuery = canRelease
        ? supabase.from('loan_term_options')
          .select('id, term_months, payment_frequency')
          .eq('is_active', true)
          .order('term_months')
          .order('payment_frequency')
        : Promise.resolve({ data: [], error: null });
      const [requestResult, loanResult, memberResult, termResult] = await Promise.all([
        requestQuery,
        supabase
          .from('loans')
          .select('id, loan_number, request_id, member_id, principal_amount, total_amount, term_months, payment_frequency, approval_date, status, member:members(first_name, middle_name, last_name, member_number)')
          .in('status', ['approved', 'active'])
          .order('approval_date', { ascending: true })
          .limit(500),
        memberQuery,
        termQuery
      ]);
      if (requestResult.error) throw requestResult.error;
      if (loanResult.error) throw loanResult.error;
      if (memberResult.error) throw memberResult.error;
      if (termResult.error) throw termResult.error;
      setRequests(requestResult.data || []);
      setApprovedLoans(loanResult.data || []);
      setMembers(memberResult.data || []);
      setTerms(termResult.data || []);
    } catch (loadError) {
      console.error('Unable to load loan requests:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'loan requests'));
    } finally {
      setLoading(false);
    }
  }, [canRelease, canViewQueue]);

  useEffect(() => {
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions(
    ['requests', 'loans', 'cash_disbursements'].map((table) => ({ table, onUpdate: load })),
    [load]
  );

  const submitDecision = async () => {
    if (!decision || !notes.trim()) return;
    setBusyId(decision.id);
    setError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_loan_request', {
        p_request_id: decision.id,
        p_decision: decision.status,
        p_notes: notes.trim()
      });
      if (reviewError) throw reviewError;
      setDecision(null);
      setNotes('');
      await load();
    } catch (reviewError) {
      console.error('Unable to review loan request:', reviewError);
      const message = reviewError.code === 'PGRST202'
        ? 'The loan-approval database function is not installed yet. Apply migration 20261013000015_repair_loan_application_approval_rpc.sql, then refresh this page. No decision was saved.'
        : reviewError.message;
      setError(`The decision could not be saved: ${message}`);
    } finally {
      setBusyId(null);
    }
  };

  const releaseLoan = async ({ loanId, date, voucher, paymentSource }) => {
    setBusyId(loanId);
    try {
      const { error: releaseError } = await supabase.rpc('record_loan_disbursement', {
        p_loan_id: loanId,
        p_voucher_number: voucher,
        p_disbursement_date: date,
        p_payment_source: paymentSource
      });
      if (releaseError) throw releaseError;
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const manuallyEnteringMember = members.length === 0;
    const manuallyEnteringTerm = terms.length === 0;
    const member = members.find((candidate) => candidate.id === selectedMember);
    const resolvedMemberName = manuallyEnteringMember
      ? memberName.trim()
      : member ? fullName(member) : '';
    const term = manuallyEnteringTerm
      ? { term_months: Number(termMonths), payment_frequency: paymentFrequency }
      : terms.find((option) => option.id === selectedTerm);
    if (
      !resolvedMemberName ||
      !loanType.trim() ||
      !purpose.trim() ||
      !term ||
      !Number.isInteger(Number(term.term_months)) ||
      Number(term.term_months) <= 0 ||
      !['monthly', 'weekly'].includes(term.payment_frequency) ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      setError('Complete all loan application fields with a valid amount.');
      return;
    }

    setSavingApplication(true);
    try {
      if (manuallyEnteringMember || !navigator.onLine || offlineMode) {
        const operationId = await queueOperation({
          type: 'bookkeeper_loan_application',
          payload: {
            p_member_name: resolvedMemberName,
            p_amount: Number(amount),
            p_loan_type: loanType.trim(),
            p_purpose: purpose.trim(),
            p_term_months: Number(term.term_months),
            p_frequency: term.payment_frequency
          },
          userId: user?.id,
          actorRole: staff?.role,
          actorName: staff?.full_name,
          allowLocalQueue: true,
          summary: `Loan application for ${resolvedMemberName}`,
          details: {
            memberName: resolvedMemberName,
            amount: Number(amount),
            termMonths: Number(term.term_months),
            paymentFrequency: term.payment_frequency,
            localRecordedAt: new Date().toISOString(),
          },
        });
        setNotice('Loan application saved on this device. It will be matched to an active member and checked against current repayment terms when online.');
        if (navigator.onLine && !offlineMode) {
          try {
            await syncPendingOperations();
            let operation = await getOperation(operationId);
            if (operation?.status === 'pending') {
              await syncPendingOperations();
              operation = await getOperation(operationId);
            }
            if (operation?.status === 'synced') {
              setNotice('Member matched and loan application sent to the Manager for review.');
              setMemberName('');
              setSelectedMember('');
              setLoanType('');
              setAmount('');
              setPurpose('');
              setSelectedTerm('');
              setTermMonths('');
              setPaymentFrequency('');
              await load();
            } else if (operation?.status === 'failed') {
              setError(operation.lastError || 'The loan application could not be verified and submitted.');
              setNotice('');
            }
          } catch (syncError) {
            console.error('Loan application was saved but could not be synchronized:', syncError);
            setError(`Saved on this device, but synchronization could not finish: ${syncError.message || 'try again when online.'}`);
          }
        }
        return;
      }

      const { error: submitError } = await supabase.rpc('submit_loan_request_for_member', {
        p_member_id: selectedMember,
        p_amount: Number(amount),
        p_loan_type: loanType.trim(),
        p_purpose: purpose.trim(),
        p_term_months: term.term_months,
        p_frequency: term.payment_frequency
      });
      if (submitError) throw submitError;
      setSelectedMember('');
      setMemberName('');
      setLoanType('');
      setAmount('');
      setPurpose('');
      setSelectedTerm('');
      setTermMonths('');
      setPaymentFrequency('');
      setNotice('Loan application sent to the Manager for review.');
      await load();
    } catch (submitError) {
      console.error('Unable to create loan application:', submitError);
      const message = submitError.code === 'PGRST202'
        ? 'Bookkeeper loan entry is not enabled on the server yet. Apply migration 20261019000003_bookkeeper_loan_application_entry.sql, then refresh this page.'
        : submitError.message;
      setError(message || 'The loan application could not be submitted.');
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{staff?.role === 'treasurer' ? 'Approved Loans' : 'Loan Requests'}</h1>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw aria-hidden="true" size={16} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

      {canRelease && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Enter a loan application</h2>
          <form onSubmit={submitApplication} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Member *
              {members.length === 0 ? (
                <>
                  <input required maxLength={200} value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Enter member's full name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <span className="mt-1 block text-xs text-amber-800">The server will submit only if exactly one active member has this full name.</span>
                </>
              ) : (
                <select required value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <option value="">Select a member</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)} · {member.member_number}</option>)}
                </select>
              )}
            </label>
            <label className="text-sm font-medium text-gray-700">
              Loan type *
              <select required value={loanType} onChange={(event) => setLoanType(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="">Select a loan type</option>
                {loanTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Amount *
              <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Repayment term *
              {terms.length === 0 ? (
                <>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input required type="number" min="1" step="1" value={termMonths} onChange={(event) => setTermMonths(event.target.value)} placeholder="Months" aria-label="Repayment term in months" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                    <select required value={paymentFrequency} onChange={(event) => setPaymentFrequency(event.target.value)} aria-label="Payment frequency" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                      <option value="" disabled>Select frequency</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <span className="mt-1 block text-xs text-amber-800">The server will accept this only if it matches an active configured repayment term.</span>
                </>
              ) : (
                <select required value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <option value="">Select a term</option>
                  {terms.map((term) => <option key={term.id} value={term.id}>{term.term_months} months · {term.payment_frequency}</option>)}
                </select>
              )}
            </label>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">
              Purpose *
              <textarea required maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <button type="submit" disabled={savingApplication} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:col-span-2">
              {savingApplication ? 'Submitting...' : !navigator.onLine || offlineMode ? 'Save loan application offline' : 'Send for Manager approval'}
            </button>
          </form>
        </section>
      )}

      {canViewQueue && <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 aria-hidden="true" className="text-amber-700" size={20} />
          <h2 className="text-lg font-semibold text-gray-900">Applications awaiting decision ({requests.length})</h2>
        </div>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No loan applications are waiting for review.</p>
        ) : requests.map((request) => {
          const data = requestData(request);
          return (
            <article key={request.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{fullName(memberOf(request))}</h3>
                  <p className="mt-1 text-sm text-gray-600">{request.request_number} · Submitted {new Date(request.created_at).toLocaleDateString('en-PH')}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{request.status.replace('_', ' ')}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <p className="text-sm text-gray-600">Requested <strong className="block text-gray-900">{formatMoney(request.amount)}</strong></p>
                <p className="text-sm text-gray-600">Loan type <strong className="block text-gray-900">{data.loan_type || 'Not specified'}</strong></p>
                <p className="text-sm text-gray-600">Proposed terms <strong className="block text-gray-900">{data.term_months || '—'} months · {data.payment_frequency || 'monthly'}</strong></p>
                <p className="text-sm text-gray-600 sm:col-span-3">Purpose <strong className="block text-gray-900">{data.purpose || 'Not provided'}</strong></p>
                <p className="text-sm text-gray-600">Quoted interest <strong className="block text-gray-900">{formatMoney(data.total_interest)}</strong></p>
                <p className="text-sm text-gray-600">Estimated total payable <strong className="block text-gray-900">{formatMoney(data.total_payable)}</strong></p>
                <p className="text-sm text-gray-600">Installment <strong className="block text-gray-900">{formatMoney(data.installment_amount)}</strong></p>
              </div>
              {canReview ? (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
                  <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...request, status: 'approved' }); }} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Approve application</button>
                  <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...request, status: 'rejected' }); }} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Reject application</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Check aria-hidden="true" className="text-blue-700" size={20} />
          <h2 className="text-lg font-semibold text-gray-900">Approved loans ({approvedLoans.length})</h2>
        </div>
        {approvedLoans.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No approved loans to show.</p>
        ) : approvedLoans.map((loan) => canRelease && loan.status === 'approved' ? (
          <LoanReleaseCard key={loan.id} loan={loan} busy={busyId === loan.id} onRelease={releaseLoan} />
        ) : (
          <article key={loan.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="font-semibold text-gray-900">{fullName(memberOf(loan))} · {loan.loan_number}</h3>
            <p className="mt-1 text-sm text-gray-600">{loan.status === 'active' ? 'Cash released' : 'Approved · awaiting Bookkeeper cash release'} · Principal {formatMoney(loan.principal_amount)} · Term {loan.term_months} months</p>
          </article>
        ))}
      </section>

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="loan-review-title">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="loan-review-title" className="text-xl font-bold text-gray-900">{decision.status === 'approved' ? 'Approve loan application' : 'Reject loan application'}</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">{fullName(memberOf(decision))} · {formatMoney(decision.amount)}</p>
            {decision.status === 'approved' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Approval creates an approved loan record only. The loan becomes active and its repayment schedule starts only after the Bookkeeper records the actual cash release.</p>}
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Decision notes *
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" disabled={!!busyId} onClick={() => setDecision(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={!notes.trim() || !!busyId} onClick={submitDecision} className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${decision.status === 'approved' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'}`}>
                {busyId ? 'Saving...' : decision.status === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanRequests;

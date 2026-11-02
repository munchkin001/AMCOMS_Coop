import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import LoadingSpinner from '../common/LoadingSpinner';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { queueOperation, getOperation } from '../../lib/Offline/syncQueue';
import { syncPendingOperations } from '../../lib/Offline/syncOperations';
import offlineDb from '../../lib/Offline/OfflineDb';

const today = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fullName = (member) => [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
const memberOf = (record) => (Array.isArray(record?.member) ? record.member[0] : record?.member);
const matchesMemberSearch = (record, query, identifier) => {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  const member = memberOf(record);
  return [fullName(member), member?.member_number, identifier]
    .some((value) => String(value || '').toLocaleLowerCase().includes(search));
};
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

export const LegacyLoanRequests = () => {
  const { user, staff, offlineMode } = useAuth();
  const canReview = staff?.role === 'manager';
  const canRelease = staff?.role === 'bookkeeper';
  const canViewQueue = ['manager', 'bookkeeper'].includes(staff?.role);
  const userId = user?.id;
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [memberLoadAttempt, setMemberLoadAttempt] = useState(0);
  const [terms, setTerms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [approvedLoans, setApprovedLoans] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [requestSearch, setRequestSearch] = useState('');
  const [loanSearch, setLoanSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [memberName, setMemberName] = useState('');
  const [loanType, setLoanType] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [collateralType, setCollateralType] = useState('');
  const [collateralDescription, setCollateralDescription] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorContact, setGuarantorContact] = useState('');
  const [processingFee, setProcessingFee] = useState('0');
  const [serviceFee, setServiceFee] = useState('0');
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
  const activeTerm = terms.find((term) => term.id === selectedTerm);
  const requestedAmount = Number(amount);
  const quotePreview = activeTerm && Number.isFinite(requestedAmount) && requestedAmount > 0
    ? (() => {
      const installments = activeTerm.payment_frequency === 'weekly'
        ? Math.round(activeTerm.term_months * 52 / 12)
        : activeTerm.term_months;
      const interest = Math.round(requestedAmount * Number(activeTerm.annual_rate) / 100 * activeTerm.term_months / 12 * 100) / 100;
      const total = requestedAmount + interest;
      return { interest, total, installment: Math.round(total / installments * 100) / 100 };
    })()
    : null;

  useEffect(() => {
    if (!canRelease) {
      setMembersLoading(false);
      return undefined;
    }

    let active = true;
    const cacheKey = userId ? `cashbook-members:${userId}` : null;

    const loadMembers = async () => {
      setMembersLoading(true);
      setMembersError('');
      setMembers([]);

      try {
        if (!navigator.onLine || offlineMode) {
          const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
          if (!Array.isArray(cached?.data)) {
            throw new Error('No member list is saved on this device. Reconnect and retry to load the member list.');
          }
          if (active) {
            setMembers(cached.data);
            if (cached.data.length === 0) setMembersError('No active members were found in the saved list.');
          }
          return;
        }

        const { data, error: memberError } = await supabase.from('members')
          .select('id, member_number, first_name, middle_name, last_name')
          .eq('membership_status', 'active')
          .is('archived_at', null)
          .order('last_name');
        if (memberError) throw memberError;

        if (active) {
          setMembers(data || []);
          if (!data?.length) setMembersError('No active members were found.');
        }
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({
              key: cacheKey,
              data: data || [],
              updatedAt: new Date().toISOString(),
            });
          } catch (cacheError) {
            console.error('Unable to cache loan request members:', cacheError);
          }
        }
      } catch (memberError) {
        console.error('Unable to load loan request members:', memberError);
        let cached = null;
        try {
          cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
        } catch (cacheError) {
          console.error('Unable to read cached loan request members:', cacheError);
        }
        if (active && Array.isArray(cached?.data) && cached.data.length > 0) {
          setMembers(cached.data);
          setMembersError('Showing the saved member list. Reconnect and refresh it before submitting.');
        } else if (active) {
          setMembers([]);
          setMembersError(memberError instanceof Error
            ? memberError.message
            : 'The member list could not be loaded. Retry or enter the member name for offline sync.');
        }
      } finally {
        if (active) setMembersLoading(false);
      }
    };

    loadMembers();
    return () => { active = false; };
  }, [canRelease, memberLoadAttempt, offlineMode, userId]);

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
      const termQuery = canRelease
        ? supabase.from('loan_term_options')
          .select('id, term_months, payment_frequency, annual_rate, penalty_rate')
          .eq('is_active', true)
          .order('term_months')
          .order('payment_frequency')
        : Promise.resolve({ data: [], error: null });
      const [requestResult, loanResult, termResult] = await Promise.all([
        requestQuery,
        supabase
          .from('loans')
          .select('id, loan_number, request_id, member_id, principal_amount, interest_rate, total_interest, total_amount, balance, term_months, payment_frequency, installments, installment_amount, monthly_payment, penalty_rate, penalty_total, application_date, approval_date, release_date, maturity_date, status, notes, member:members(first_name, middle_name, last_name, member_number), request:requests!loans_request_id_fkey(request_number, request_data)')
          .in('status', ['approved', 'active'])
          .order('approval_date', { ascending: true })
          .limit(500),
        termQuery
      ]);
      if (requestResult.error) throw requestResult.error;
      if (loanResult.error) throw loanResult.error;
      if (termResult.error) throw termResult.error;
      setRequests(requestResult.data || []);
      setApprovedLoans(loanResult.data || []);
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
    const applicationDetails = {
      collateral_type: collateralType.trim(),
      collateral_description: collateralDescription.trim(),
      guarantor_name: guarantorName.trim(),
      guarantor_contact: guarantorContact.trim(),
      processing_fee: Number(processingFee || 0),
      service_fee: Number(serviceFee || 0),
    };
    if (
      !resolvedMemberName ||
      !loanType.trim() ||
      !purpose.trim() ||
      !term ||
      !Number.isInteger(Number(term.term_months)) ||
      Number(term.term_months) <= 0 ||
      !['monthly', 'weekly'].includes(term.payment_frequency) ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0 ||
      !Number.isFinite(applicationDetails.processing_fee) ||
      applicationDetails.processing_fee < 0 ||
      !Number.isFinite(applicationDetails.service_fee) ||
      applicationDetails.service_fee < 0
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
            p_frequency: term.payment_frequency,
            p_application_details: applicationDetails,
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
            applicationDetails,
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
              setCollateralType('');
              setCollateralDescription('');
              setGuarantorName('');
              setGuarantorContact('');
              setProcessingFee('0');
              setServiceFee('0');
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

      const { error: submitError } = await supabase.rpc('submit_loan_request_for_member_with_details', {
        p_member_id: selectedMember,
        p_amount: Number(amount),
        p_loan_type: loanType.trim(),
        p_purpose: purpose.trim(),
        p_term_months: term.term_months,
        p_frequency: term.payment_frequency,
        p_application_details: applicationDetails,
      });
      if (submitError) throw submitError;
      setSelectedMember('');
      setMemberName('');
      setLoanType('');
      setAmount('');
      setPurpose('');
      setCollateralType('');
      setCollateralDescription('');
      setGuarantorName('');
      setGuarantorContact('');
      setProcessingFee('0');
      setServiceFee('0');
      setSelectedTerm('');
      setTermMonths('');
      setPaymentFrequency('');
      setNotice('Loan application sent to the Manager for review.');
      await load();
    } catch (submitError) {
      console.error('Unable to create loan application:', submitError);
      const message = submitError.code === 'PGRST202'
        ? 'The detailed loan application function is not enabled on the server yet. Apply migration 20261030000001_loan_application_details.sql, then refresh this page.'
        : submitError.message;
      setError(message || 'The loan application could not be submitted.');
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const filteredRequests = requests.filter((request) => matchesMemberSearch(request, requestSearch, request.request_number));
  const filteredApprovedLoans = approvedLoans.filter((loan) => matchesMemberSearch(loan, loanSearch, loan.loan_number));

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
      {canRelease && membersError && (
        <div role={members.length > 0 ? 'status' : 'alert'} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{membersError}</span>
          {navigator.onLine && !offlineMode && (
            <button type="button" onClick={() => setMemberLoadAttempt((attempt) => attempt + 1)} disabled={membersLoading} className="rounded-md border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100 disabled:opacity-50">
              {membersLoading ? 'Loading...' : 'Retry member list'}
            </button>
          )}
        </div>
      )}

      {canRelease && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Enter a loan application</h2>
          <form onSubmit={submitApplication} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Member *
              {membersLoading || members.length > 0 ? (
                <select required disabled={membersLoading || members.length === 0} value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100">
                  <option value="">{membersLoading ? 'Loading members...' : 'Select a member'}</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{fullName(member)}{member.member_number ? ` (${member.member_number})` : ''}</option>)}
                </select>
              ) : (
                <>
                  <input required maxLength={200} value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Enter member's full name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <span className="mt-1 block text-xs text-amber-800">The server will submit only if exactly one active member has this full name.</span>
                </>
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
                  {terms.map((term) => <option key={term.id} value={term.id}>{term.term_months} months · {term.payment_frequency} · {term.annual_rate}% annual interest</option>)}
                </select>
              )}
            </label>
            {activeTerm && (
              <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
                Configured rate: <strong>{activeTerm.annual_rate}% annual interest</strong> · {activeTerm.penalty_rate}% penalty rate for overdue payments.
                {quotePreview && <> Estimated interest: <strong>{formatMoney(quotePreview.interest)}</strong> · total repayment: <strong>{formatMoney(quotePreview.total)}</strong> · installment: <strong>{formatMoney(quotePreview.installment)}</strong>.</>}
                <span className="mt-1 block text-xs">Estimate only; the server recalculates the final quote using the active cooperative terms.</span>
              </p>
            )}
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">
              Purpose *
              <textarea required maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <fieldset className="grid gap-3 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-gray-800">Security and guarantor (if applicable)</legend>
              <label className="text-sm font-medium text-gray-700">
                Collateral type
                <input maxLength={80} value={collateralType} onChange={(event) => setCollateralType(event.target.value)} placeholder="e.g. savings, equipment, property" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Collateral details
                <input maxLength={300} value={collateralDescription} onChange={(event) => setCollateralDescription(event.target.value)} placeholder="Description or identifying details" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Co-maker / guarantor name
                <input maxLength={160} value={guarantorName} onChange={(event) => setGuarantorName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Co-maker / guarantor contact
                <input maxLength={80} value={guarantorContact} onChange={(event) => setGuarantorContact(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <p className="text-xs text-gray-500 sm:col-span-2">These details are subject to cooperative policy and Manager verification.</p>
            </fieldset>
            <fieldset className="grid gap-3 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-gray-800">Fees (if applicable)</legend>
              <label className="text-sm font-medium text-gray-700">
                Processing fee (₱)
                <input type="number" min="0" step="0.01" value={processingFee} onChange={(event) => setProcessingFee(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Other / service fee (₱)
                <input type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <p className="text-xs text-gray-500 sm:col-span-2">Enter only fees confirmed by cooperative policy. Fees are recorded separately and are not included in the interest quote.</p>
            </fieldset>
            <button type="submit" disabled={savingApplication} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:col-span-2">
              {savingApplication ? 'Submitting...' : !navigator.onLine || offlineMode ? 'Save loan application offline' : 'Send for Manager approval'}
            </button>
          </form>
        </section>
      )}

      {canViewQueue && <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="text-amber-700" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Applications awaiting decision ({requests.length})</h2>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search member or request" aria-label="Search loan applications by member or request number" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
        </div>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No loan applications are waiting for review.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Member</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Request</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Loan type</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Amount</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Submitted</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">No loan applications match “{requestSearch}”.</td></tr>
                ) : filteredRequests.map((request) => {
                  const data = requestData(request);
                  return (
                    <tr
                      key={request.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`View loan application ${request.request_number} for ${fullName(memberOf(request))}`}
                      onClick={() => setSelectedRequest(request)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedRequest(request);
                        }
                      }}
                      className="cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-900">{fullName(memberOf(request))}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{request.request_number}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{data.loan_type || 'Not specified'}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(request.amount)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{new Date(request.created_at).toLocaleDateString('en-PH')}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-900">{request.status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {selectedRequest && (() => {
        const data = requestData(selectedRequest);
        const applicationDetails = data.application_details || {};
        return (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRequest(null);
            }}
          >
            <section role="dialog" aria-modal="true" aria-labelledby="loan-request-details-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl">
              <header className="relative overflow-hidden bg-gradient-to-br from-[#163c34] via-[#1d5145] to-[#276456] px-5 py-5 text-white sm:px-7">
                <div className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Loan application</p>
                    <h2 id="loan-request-details-title" className="mt-1 text-2xl font-bold tracking-tight">Application details</h2>
                    <p className="mt-1 break-all text-sm text-emerald-100">{selectedRequest.request_number} · Submitted {new Date(selectedRequest.created_at).toLocaleDateString('en-PH')}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedRequest(null)} aria-label="Close loan application details" className="flex size-9 flex-none items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <X aria-hidden="true" size={20} />
                  </button>
                </div>
                <div className="relative mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/15 pt-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">Requested amount</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(selectedRequest.amount)}</p>
                    <p className="mt-1 text-sm text-emerald-100">{fullName(memberOf(selectedRequest))}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-amber-200/20 bg-amber-200/15 px-3 py-1.5 text-xs font-semibold capitalize text-amber-50">
                    {selectedRequest.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <header className="border-b border-slate-100 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Request information</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Terms and details provided with the application</p>
                  </header>
                  <dl className="grid gap-px bg-slate-100 sm:grid-cols-2">
                    {[
                      ['Member', fullName(memberOf(selectedRequest))],
                      ['Loan type', data.loan_type || 'Not specified'],
                      ['Proposed terms', `${data.term_months || '—'} months · ${data.payment_frequency || 'monthly'}`],
                      ['Purpose', data.purpose || 'Not provided'],
                      ['Quoted interest', formatMoney(data.total_interest)],
                      ['Estimated total payable', formatMoney(data.total_payable)],
                      ['Installment', formatMoney(data.installment_amount)],
                      ['Annual interest rate', `${data.annual_rate ?? '—'}%`],
                      ['Late-payment penalty rate', `${data.penalty_rate ?? '—'}%`],
                      ['Fees (processing / service)', `${formatMoney(applicationDetails.processing_fee)} / ${formatMoney(applicationDetails.service_fee)}`],
                      ['Collateral', [applicationDetails.collateral_type, applicationDetails.collateral_description].filter(Boolean).join(' — ') || 'Not provided'],
                      ['Co-maker / guarantor', [applicationDetails.guarantor_name, applicationDetails.guarantor_contact].filter(Boolean).join(' · ') || 'Not provided']
                    ].map(([label, value]) => (
                      <div key={label} className={`min-w-0 bg-white px-4 py-3 ${['Purpose', 'Collateral', 'Co-maker / guarantor'].includes(label) ? 'sm:col-span-2' : ''}`}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not provided'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {canReview && (
                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...selectedRequest, status: 'rejected' }); setSelectedRequest(null); }} className="min-h-10 rounded-lg border border-red-200 bg-white px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Reject application</button>
                    <button type="button" disabled={!!busyId} onClick={() => { setNotes(''); setDecision({ ...selectedRequest, status: 'approved' }); setSelectedRequest(null); }} className="min-h-10 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-50">Approve application</button>
                  </div>
                )}
              </div>
            </section>
          </div>
        );
      })()}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Check aria-hidden="true" className="text-blue-700" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Approved loans ({approvedLoans.length})</h2>
          </div>
          {!canRelease && (
            <label className="relative block w-full sm:w-72">
              <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder="Search member or loan" aria-label="Search approved loans by member or loan number" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </label>
          )}
        </div>
        {approvedLoans.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No approved loans to show.</p>
        ) : canRelease ? (
          approvedLoans.map((loan) => loan.status === 'approved' ? (
            <LoanReleaseCard key={loan.id} loan={loan} busy={busyId === loan.id} onRelease={releaseLoan} />
          ) : (
            <article key={loan.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">{fullName(memberOf(loan))} · {loan.loan_number}</h3>
              <p className="mt-1 text-sm text-gray-600">Cash released · Principal {formatMoney(loan.principal_amount)} · Term {loan.term_months} months</p>
            </article>
          ))
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Member</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Loan number</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Principal</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Installment</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Balance</th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredApprovedLoans.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">No approved loans match “{loanSearch}”.</td></tr>
                ) : filteredApprovedLoans.map((loan) => (
                  <tr
                    key={loan.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View loan details for ${loan.loan_number}, ${fullName(memberOf(loan))}`}
                    onClick={() => setSelectedLoan(loan)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedLoan(loan);
                      }
                    }}
                    className="cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-900">{fullName(memberOf(loan))}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{loan.loan_number}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.principal_amount)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.installment_amount ?? loan.monthly_payment)} · {loan.payment_frequency}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{formatMoney(loan.balance)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-gray-700">{loan.status === 'active' ? 'Cash released' : 'Awaiting disbursement'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLoan && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedLoan(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="approved-loan-details-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {(() => {
              const application = requestData(selectedLoan.request);
              const member = memberOf(selectedLoan);
              const loanStatus = selectedLoan.status === 'active' ? 'Cash released' : 'Awaiting disbursement';
              const detailRows = [
                ['Loan type', application.loan_type || 'Not specified'],
                ['Repayment term', `${selectedLoan.term_months} months`],
                ['Payment frequency', selectedLoan.payment_frequency || 'Not specified'],
                ['Installments', selectedLoan.installments ? `${selectedLoan.installments} payments` : 'Not available'],
                ['Installment amount', formatMoney(selectedLoan.installment_amount ?? selectedLoan.monthly_payment)],
                ['Annual interest rate', `${selectedLoan.interest_rate ?? 0}%`],
                ['Late-payment penalty rate', `${selectedLoan.penalty_rate ?? 0}%`],
              ];
              const dateRows = [
                ['Application date', selectedLoan.application_date],
                ['Approval date', selectedLoan.approval_date],
                ['Cash release date', selectedLoan.release_date],
                ['Maturity date', selectedLoan.maturity_date],
              ];
              const securityRows = [
                ['Collateral', [application.application_details?.collateral_type, application.application_details?.collateral_description].filter(Boolean).join(' — ')],
                ['Co-maker / guarantor', [application.application_details?.guarantor_name, application.application_details?.guarantor_contact].filter(Boolean).join(' · ')],
                ['Processing fee', formatMoney(application.application_details?.processing_fee)],
                ['Service fee', formatMoney(application.application_details?.service_fee)],
              ];
              const detailValue = (value) => value || 'Not provided';
              const displayDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not available';
              return (
                <>
                  <header className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 px-6 py-6 text-white sm:px-8">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Loan account</p>
                        <h2 id="approved-loan-details-title" className="mt-1 text-2xl font-bold">{selectedLoan.loan_number}</h2>
                        <p className="mt-2 text-sm text-blue-100">{fullName(member)}{member?.member_number ? ` · Member ${member.member_number}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => setSelectedLoan(null)} aria-label="Close loan details" className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white">
                        <X aria-hidden="true" size={20} />
                      </button>
                    </div>
                    <span className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedLoan.status === 'active' ? 'bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-200/30' : 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/30'}`}>
                      <span className={`h-2 w-2 rounded-full ${selectedLoan.status === 'active' ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                      {loanStatus}
                    </span>
                  </header>
                  <div className="max-h-[calc(92vh-170px)] space-y-6 overflow-y-auto bg-slate-50 p-6 sm:p-8">
                    <section aria-label="Loan financial summary" className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Principal</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(selectedLoan.principal_amount)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total interest</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(selectedLoan.total_interest)}</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Total payable</p>
                        <p className="mt-2 text-xl font-bold text-amber-950">{formatMoney(selectedLoan.total_amount)}</p>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Repayment details</h3>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {detailRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 font-semibold capitalize text-slate-900">{value}</dd>
                          </div>
                        ))}
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Current balance</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{formatMoney(selectedLoan.balance)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Penalties recorded</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{formatMoney(selectedLoan.penalty_total)}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Loan timeline</h3>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {dateRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 font-semibold text-slate-900">{displayDate(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Application information</h3>
                      {selectedLoan.request?.request_number && <p className="mt-1 text-xs text-slate-500">Request {selectedLoan.request.request_number}</p>}
                      <div className="mt-4">
                        <p className="text-xs font-medium text-slate-500">Purpose</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{detailValue(application.purpose || selectedLoan.notes)}</p>
                      </div>
                      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {securityRows.map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium text-slate-500">{label}</dt>
                            <dd className="mt-1 text-sm font-medium text-slate-800">{detailValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}

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

export default LegacyLoanRequests;

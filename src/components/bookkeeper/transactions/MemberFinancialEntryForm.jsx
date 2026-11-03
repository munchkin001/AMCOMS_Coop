import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import offlineDb from '../../../lib/Offline/OfflineDb';
import { getDataLoadErrorMessage } from '../../../lib/errorHandler';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight } from 'lucide-react';
import MemberBalanceSummary from './MemberBalanceSummary';

const entryTypes = [
  { value: 'savings_deposit', label: 'Savings deposit', receipt: true, account: 'regular' },
  { value: 'savings_withdrawal', label: 'Savings withdrawal', receipt: false, account: 'regular' },
  { value: 'time_deposit', label: 'Time deposit placement', receipt: true, account: 'time_deposit' },
  { value: 'time_deposit_withdrawal', label: 'Time deposit withdrawal', receipt: false, account: 'time_deposit' },
  { value: 'loan_payment', label: 'Loan payment', receipt: true },
  { value: 'capital_contribution', label: 'Monthly capital share', receipt: true },
  { value: 'dividend_distribution', label: 'Approved dividend distribution', receipt: false, dividend: true }
];

const loanPaymentParticulars = [
  'Loan installment payment',
  'Partial loan payment',
  'Past-due installment payment',
  'Full loan settlement'
];

const currentDate = () => new Date().toISOString().slice(0, 10);
const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const maturityInstructionOptions = [
  { value: 'release_principal_and_interest', label: 'Release principal and interest' },
  { value: 'renew_principal', label: 'Request renewal of principal only' },
  { value: 'renew_principal_and_interest', label: 'Request renewal of principal and interest' }
];

const addMonthsToDate = (date, months) => {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const maturity = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), Math.min(day, lastDay)));
  return maturity.toISOString().slice(0, 10);
};

const getDaysBetweenDates = (start, end) => {
  if (!start || !end) return 0;
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000;
};

const getLoanInterestPerInstallment = (loan) => {
  const installments = Math.max(Number(loan.installments || loan.term_months || 1), 1);
  const regularInterest = Number((Number(loan.total_interest || 0) / installments).toFixed(2));
  return regularInterest;
};

const getLoanScheduleSummary = (loan) => {
  if (!loan) return null;
  const installments = Math.max(Number(loan.installments || loan.term_months || 1), 1);
  const totalInterest = Number(loan.total_interest || 0);
  const regularInterest = getLoanInterestPerInstallment(loan);
  const installmentAmount = Number(loan.installment_amount ?? loan.monthly_payment ?? 0);
  const oldestUnpaid = (loan.schedule || []).find((installment) => {
    const openBase = Math.max(Number(installment.amount_due) - Number(installment.amount_paid), 0);
    const openPenalty = Math.max(
      Number(installment.penalty_amount || 0) - Math.max(Number(installment.amount_paid) - Number(installment.amount_due), 0),
      0
    );
    return openBase + openPenalty > 0;
  });
  const finalInterest = Number((totalInterest - regularInterest * (installments - 1)).toFixed(2));
  const scheduledInterest = oldestUnpaid?.installment_number === installments ? finalInterest : regularInterest;
  const scheduledAmount = oldestUnpaid ? Number(oldestUnpaid.amount_due) : installmentAmount;
  const openBase = oldestUnpaid
    ? Math.max(Number(oldestUnpaid.amount_due) - Number(oldestUnpaid.amount_paid), 0)
    : 0;
  const remainingInterest = oldestUnpaid && Number(oldestUnpaid.amount_due) > 0
    ? Number((openBase * Math.min(scheduledInterest, Number(oldestUnpaid.amount_due)) / Number(oldestUnpaid.amount_due)).toFixed(2))
    : 0;
  const openPenalty = oldestUnpaid
    ? Math.max(
      Number(oldestUnpaid.penalty_amount || 0)
        - Math.max(Number(oldestUnpaid.amount_paid) - Number(oldestUnpaid.amount_due), 0),
      0
    )
    : 0;

  return {
    installments,
    installmentAmount: scheduledAmount,
    interestPerInstallment: scheduledInterest,
    principalPerInstallment: Math.max(scheduledAmount - scheduledInterest, 0),
    oldestUnpaid,
    remainingPrincipalAndInterest: openBase,
    remainingInterest,
    remainingPrincipal: Math.max(openBase - remainingInterest, 0),
    openPenalty,
    remainingDue: openBase + openPenalty
  };
};

const getDefaultAccount = (accounts, accountType) => (
  accounts.find((account) => account.account_type === accountType && Number(account.balance) > 0)
  || accounts.find((account) => account.account_type === accountType)
);

const MemberFinancialEntryForm = ({
  onSave,
  onCancel,
  initialEntryType = 'savings_deposit',
  allowedEntryTypes = null,
  title = 'Member Financial Entry'
}) => {
  const { user, offlineMode } = useAuth();
  const visibleEntryTypes = allowedEntryTypes
    ? entryTypes.filter((type) => allowedEntryTypes.includes(type.value))
    : entryTypes;
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [unpaidMonths, setUnpaidMonths] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [entryType, setEntryType] = useState(initialEntryType);
  const [memberLoadAttempt, setMemberLoadAttempt] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [date, setDate] = useState(currentDate());
  const [amount, setAmount] = useState('');
  const [cashAccount, setCashAccount] = useState('Cash on Hand');
  const [accountId, setAccountId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [depositTerm, setDepositTerm] = useState('6');
  const [customMaturityDate, setCustomMaturityDate] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [maturityInstruction, setMaturityInstruction] = useState(maturityInstructionOptions[0].value);
  const [particulars, setParticulars] = useState(
    initialEntryType === 'loan_payment' ? loanPaymentParticulars[0] : entryTypes.find((type) => type.value === initialEntryType)?.label || ''
  );
  const [dividendValues, setDividendValues] = useState({
    dividend_amount: '',
    patronage_amount: '',
    mortuary_deduction: '',
    retention_amount: '',
    savings_amount: '',
    loan_payment_amount: ''
  });
  const [loadingMemberData, setLoadingMemberData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedMember = members.find((member) => member.id === memberId);
  const selectedEntry = entryTypes.find((type) => type.value === entryType);
  const matchingAccounts = useMemo(
    () => accounts.filter((account) => account.account_type === selectedEntry?.account),
    [accounts, selectedEntry]
  );
  const selectedLoan = loans.find((loan) => loan.id === loanId);
  const selectedAccount = matchingAccounts.find((account) => account.id === accountId);
  const selectedLoanSummary = getLoanScheduleSummary(selectedLoan);
  const exceedsSelectedAccountBalance = entryType.includes('withdrawal')
    && selectedAccount
    && Number(amount) > Number(selectedAccount.balance || 0);
  const maturityDate = depositTerm === 'custom'
    ? customMaturityDate
    : addMonthsToDate(date, Number(depositTerm));
  const depositDays = getDaysBetweenDates(date, maturityDate);
  const numericDepositAmount = Number(amount);
  const numericInterestRate = Number(interestRate);
  const estimateIsValid = depositDays > 0
    && Number.isFinite(numericDepositAmount)
    && numericDepositAmount > 0
    && Number.isFinite(numericInterestRate)
    && numericInterestRate >= 0;
  const estimatedInterest = estimateIsValid
    ? Number((numericDepositAmount * (numericInterestRate / 100) * (depositDays / 365)).toFixed(2))
    : 0;
  const estimatedMaturityAmount = (Number.isFinite(numericDepositAmount) ? numericDepositAmount : 0) + estimatedInterest;
  const capitalAmount = selectedMonths.length * 100;
  const dividendTotal = Number(dividendValues.dividend_amount || 0) + Number(dividendValues.patronage_amount || 0);
  const dividendAvailable = dividendTotal - Number(dividendValues.mortuary_deduction || 0);
  const dividendAllocated = Number(dividendValues.retention_amount || 0)
    + Number(dividendValues.savings_amount || 0)
    + Number(dividendValues.loan_payment_amount || 0);
  const dividendBalanced = dividendTotal > 0
    && dividendAvailable >= 0
    && Number(dividendAvailable.toFixed(2)) === Number(dividendAllocated.toFixed(2));

  useEffect(() => {
    let active = true;

    const loadMembers = async () => {
      setMembersLoading(true);
      setMembersError('');
      const loanPaymentOnly = entryType === 'loan_payment';
      const cacheKey = `financial-members:${user?.id}`;
      try {
        if (!navigator.onLine || offlineMode) {
          if (loanPaymentOnly) {
            if (active) {
              setMembers([]);
              setMemberId('');
              setMembersError('Reconnect to check which members currently have an active loan balance to pay.');
            }
            return;
          }
          const cached = user?.id ? await offlineDb.cachedData.get(cacheKey) : null;
          if (active && cached?.data) {
            setMembers(cached.data);
            setMembersError('Using member information saved on this device. Account balances and eligibility are not authoritative until the server validates the entry.');
          } else if (active) {
            setMembersError('No member list is available on this device. Reconnect and sign in online to load it.');
          }
          return;
        }

        let eligibleMemberIds = null;
        if (loanPaymentOnly) {
          setMembers([]);
          setMemberId('');
          const { data: activeLoans, error: loanQueryError } = await supabase
            .from('loans')
            .select('member_id')
            .eq('status', 'active')
            .gt('balance', 0);
          if (loanQueryError) {
            if (active) setMembersError(getDataLoadErrorMessage(loanQueryError, 'loans'));
            return;
          }
          eligibleMemberIds = [...new Set((activeLoans || []).map((loan) => loan.member_id).filter(Boolean))];
          if (eligibleMemberIds.length === 0) {
            if (active) {
              setMembers([]);
              setMembersError('No members currently have an active loan balance to pay.');
            }
            return;
          }
        }

        let memberQuery = supabase
          .from('members')
          .select('id, member_number, first_name, middle_name, last_name, date_joined')
          .eq('membership_status', 'active')
          .is('archived_at', null);
        if (eligibleMemberIds) memberQuery = memberQuery.in('id', eligibleMemberIds);
        const { data, error: queryError } = await memberQuery.order('last_name');
        if (!active) return;
        if (queryError) {
          const cached = !loanPaymentOnly && user?.id ? await offlineDb.cachedData.get(cacheKey) : null;
          if (cached?.data) {
            setMembers(cached.data);
            setMembersError('Showing saved member information. Balances and eligibility will be checked when the entry syncs.');
            return;
          }
          setMembersError(getDataLoadErrorMessage(queryError, 'members'));
        } else {
          setMembers(data || []);
          if (loanPaymentOnly && !data?.length) {
            setMembersError('No active members currently have an outstanding loan balance to pay.');
          }
          if (!loanPaymentOnly && user?.id) {
            await offlineDb.cachedData.put({
              key: cacheKey,
              data: data || [],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch (loadError) {
        if (!active) return;
        const cached = !loanPaymentOnly && user?.id ? await offlineDb.cachedData.get(cacheKey) : null;
        if (cached?.data) {
          setMembers(cached.data);
          setMembersError('Showing saved member information. Balances and eligibility will be checked when the entry syncs.');
        } else {
          setMembersError(getDataLoadErrorMessage(loadError, loanPaymentOnly ? 'loans' : 'members'));
        }
      } finally {
        if (active) setMembersLoading(false);
      }
    };

    const handleOffline = () => {
      setMembersError('You are offline. Reconnect to load members and record financial entries.');
      setMembersLoading(false);
    };
    const handleOnline = () => { loadMembers(); };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    loadMembers();

    return () => {
      active = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [entryType, memberLoadAttempt, offlineMode, user?.id]);

  useEffect(() => {
    if (!memberId) return undefined;

    let active = true;
    const loadMemberRecords = async () => {
      setLoadingMemberData(true);
      setError('');
      const cacheKey = `financial-member-records:${user?.id}:${memberId}`;
      try {
        if (!navigator.onLine || offlineMode) {
          const cached = user?.id ? await offlineDb.cachedData.get(cacheKey) : null;
          if (!cached?.data) throw new Error('No account or loan details for this member are saved on this device.');
          if (!active) return;
          const { accounts: cachedAccounts, loans: cachedLoans, contributions } = cached.data;
          setAccounts(cachedAccounts);
          setLoans(cachedLoans);
          const paidMonths = new Set((contributions || []).map((row) => row.due_month.slice(0, 7)));
          const member = members.find((item) => item.id === memberId);
          const first = member?.date_joined ? new Date(`${member.date_joined}T00:00:00`) : null;
          const last = new Date();
          const months = [];
          if (first) {
            const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
            const end = new Date(last.getFullYear(), last.getMonth(), 1);
            while (cursor <= end) {
              const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
              if (!paidMonths.has(key)) months.push(`${key}-01`);
              cursor.setMonth(cursor.getMonth() + 1);
            }
          }
          setUnpaidMonths(months);
          setSelectedMonths([]);
          const defaultAccount = entryType.includes('withdrawal')
            ? getDefaultAccount(cachedAccounts, selectedEntry?.account)
            : null;
          const defaultLoan = entryType === 'loan_payment' ? cachedLoans?.[0] : null;
          setAccountId(defaultAccount?.id || '');
          setLoanId(defaultLoan?.id || cachedLoans?.[0]?.id || '');
          if (defaultAccount) setAmount(String(defaultAccount.balance || ''));
          else if (defaultLoan) setAmount(String(getLoanScheduleSummary(defaultLoan)?.remainingDue || defaultLoan.balance || ''));
          setError('Using saved account and loan details. Balances may be stale; the server will revalidate this entry before posting.');
          return;
        }

        const [accountResult, loanResult, contributionResult] = await Promise.all([
          supabase.from('savings_accounts')
            .select('id, account_number, account_type, balance, maturity_date, interest_rate')
            .eq('member_id', memberId)
            .eq('status', 'active')
            .order('created_at'),
          supabase.from('loans')
            .select('id, loan_number, balance, principal_amount, interest_rate, term_months, monthly_payment, total_interest, payment_frequency, installments, installment_amount, release_date, created_at')
            .eq('member_id', memberId)
            .eq('status', 'active')
            .gt('balance', 0)
            .order('release_date', { ascending: true, nullsFirst: false })
            .order('created_at'),
          supabase.from('member_capital_contributions')
            .select('due_month')
            .eq('member_id', memberId)
            .eq('status', 'recorded')
        ]);
        if (accountResult.error) throw accountResult.error;
        if (loanResult.error) throw loanResult.error;
        if (contributionResult.error) throw contributionResult.error;
        if (!active) return;
        const loanIds = (loanResult.data || []).map((loan) => loan.id);
        let scheduleRows = [];
        if (loanIds.length) {
          const { data, error: scheduleError } = await supabase.from('loan_schedule')
            .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status')
            .in('loan_id', loanIds)
            .neq('status', 'paid')
            .order('installment_number');
          if (scheduleError) throw scheduleError;
          scheduleRows = data || [];
        }
        const scheduleByLoanId = new Map();
        scheduleRows.forEach((schedule) => {
          const loanSchedule = scheduleByLoanId.get(schedule.loan_id) || [];
          loanSchedule.push(schedule);
          scheduleByLoanId.set(schedule.loan_id, loanSchedule);
        });
        const loansWithSchedule = (loanResult.data || []).map((loan) => ({
          ...loan,
          schedule: scheduleByLoanId.get(loan.id) || []
        }));
        const records = {
          accounts: accountResult.data || [],
          loans: loansWithSchedule,
          contributions: contributionResult.data || [],
        };
        if (user?.id) {
          await offlineDb.cachedData.put({
            key: cacheKey,
            data: records,
            updatedAt: new Date().toISOString(),
          });
        }

        const member = members.find((item) => item.id === memberId);
        const paidMonths = new Set((contributionResult.data || []).map((row) => row.due_month.slice(0, 7)));
        const first = member?.date_joined ? new Date(`${member.date_joined}T00:00:00`) : null;
        const last = new Date();
        const months = [];
        if (first) {
          const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
          const end = new Date(last.getFullYear(), last.getMonth(), 1);
          while (cursor <= end) {
            const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
            if (!paidMonths.has(key)) months.push(`${key}-01`);
            cursor.setMonth(cursor.getMonth() + 1);
          }
        }
        setAccounts(accountResult.data || []);
        setLoans(loansWithSchedule);
        setUnpaidMonths(months);
        setSelectedMonths([]);
        const defaultAccount = entryType.includes('withdrawal')
          ? getDefaultAccount(accountResult.data || [], selectedEntry?.account)
          : null;
        const defaultLoan = entryType === 'loan_payment' ? loansWithSchedule[0] : null;
        setAccountId(defaultAccount?.id || '');
        setLoanId(defaultLoan?.id || loansWithSchedule[0]?.id || '');
        if (defaultAccount) setAmount(String(defaultAccount.balance || ''));
        else if (defaultLoan) setAmount(String(getLoanScheduleSummary(defaultLoan)?.remainingDue || defaultLoan.balance || ''));
      } catch (loadError) {
        if (active) setError(getDataLoadErrorMessage(loadError, 'member financial records'));
      } finally {
        if (active) setLoadingMemberData(false);
      }
    };
    loadMemberRecords();
    return () => { active = false; };
  }, [entryType, memberId, members, offlineMode, selectedEntry?.account, user?.id]);

  const handleMonthToggle = (month) => {
    setSelectedMonths((current) => {
      const next = current.includes(month)
        ? current.filter((item) => item !== month)
        : [...current, month].sort();
      setAmount(String(next.length * 100 || ''));
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const numericAmount = Number(amount);
    if (!selectedMember || !date || (!selectedEntry?.dividend && !particulars.trim())) {
      setError('Select a member and enter a date and particulars.');
      return;
    }
    if (!selectedEntry?.dividend && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (entryType === 'capital_contribution' && selectedMonths.length === 0) {
      setError('Select at least one unpaid monthly capital contribution.');
      return;
    }
    if (entryType === 'dividend_distribution' && !dividendBalanced) {
      setError('Dividend plus patronage, less mortuary, must equal retention plus savings plus loan payment.');
      return;
    }
    if ((!navigator.onLine || offlineMode) && entryType === 'dividend_distribution') {
      setError('Approved dividend distributions cannot be queued offline yet. Nothing was saved.');
      return;
    }
    if (entryType === 'dividend_distribution' && Number(dividendValues.loan_payment_amount) > 0 && !loanId) {
      setError('This member has no active loan to receive the dividend loan allocation.');
      return;
    }
    if (entryType.includes('withdrawal') && !accountId) {
      setError('Select the member account to withdraw from.');
      return;
    }
    if (entryType === 'loan_payment' && !loanId) {
      setError('This member has no active loan to receive a payment.');
      return;
    }
    if (entryType === 'time_deposit' && (
      !maturityDate || maturityDate <= date || !Number.isFinite(Number(interestRate)) || Number(interestRate) < 0
    )) {
      setError('Enter a maturity date after the placement date and a valid non-negative annual interest rate.');
      return;
    }
    if (entryType === 'time_deposit' && !maturityInstructionOptions.some((option) => option.value === maturityInstruction)) {
      setError('Select a valid instruction for the time deposit maturity.');
      return;
    }

    const common = {
      member_id: memberId,
      amount: numericAmount,
      description: particulars.trim()
    };
    const pReceipt = selectedEntry.receipt ? {
      ...common,
      receipt_date: date,

      received_from: [selectedMember.first_name, selectedMember.middle_name, selectedMember.last_name].filter(Boolean).join(' '),
      payment_method: 'cash',
      status: 'recorded'
    } : null;
    const pDisbursement = selectedEntry.receipt ? null : {
      ...common,
      disbursement_date: date,
      payee: [selectedMember.first_name, selectedMember.middle_name, selectedMember.last_name].filter(Boolean).join(' '),
      payment_source: cashAccount === 'Cash on Hand' ? 'cash-on-hand' : 'cash-in-bank',
      status: 'recorded'
    };

    setSaving(true);
    try {
      if (entryType === 'dividend_distribution') {
        await onSave({
          dividend: true,
          p_distribution: {
            member_id: memberId,
            distribution_date: date,
            ...Object.fromEntries(Object.entries(dividendValues).map(([key, value]) => [key, Number(value || 0)])),
            loan_id: Number(dividendValues.loan_payment_amount) > 0 ? loanId : null,
            savings_account_id: Number(dividendValues.savings_amount) > 0 ? accountId || null : null
          }
        });
        return;
      }
      await onSave({
        p_receipt: pReceipt,
        p_disbursement: pDisbursement,
        p_entry: {
          entry_type: entryType,
          cash_account: cashAccount,
          savings_account_id: accountId || null,
          loan_id: loanId || null,
          due_months: selectedMonths,
          maturity_date: entryType === 'time_deposit' ? maturityDate : null,
          interest_rate: entryType === 'time_deposit' ? Number(interestRate) : null,
          maturity_instruction: entryType === 'time_deposit' ? maturityInstruction : null
        }
      });
    } catch (saveError) {
      setError(saveError.message || 'The member entry could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="flex items-center gap-4">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${selectedEntry?.receipt ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {selectedEntry?.receipt
              ? <ArrowDownLeft size={22} strokeWidth={2.2} aria-hidden="true" />
              : <ArrowUpRight size={22} strokeWidth={2.2} aria-hidden="true" />}
          </span>
          <div>
            <p className={`text-xs font-bold uppercase tracking-[0.15em] ${selectedEntry?.receipt ? 'text-emerald-700' : 'text-rose-700'}`}>
              {selectedEntry?.receipt ? 'Cash in · member receipt' : 'Cash out · member disbursement'}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">Enter the member and payment details. The system will apply the appropriate account rules.</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to transaction types
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {membersError && (
        <div role={members.length ? 'status' : 'alert'} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${members.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <span>{membersError}</span>
          {navigator.onLine && !offlineMode && (
            <button
              type="button"
              onClick={() => setMemberLoadAttempt((attempt) => attempt + 1)}
              disabled={membersLoading}
              className="rounded-md border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
            >
              {membersLoading ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="mb-4 border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">{entryType === 'time_deposit' ? 'Member & payment details' : 'Member transaction details'}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{entryType === 'time_deposit'
              ? 'Enter the member, placement date, amount, and payment details.'
              : 'Member, transaction type, amount, and particulars. Receipt and voucher numbers are generated automatically.'}</p>
          </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Member *
            <select
              value={memberId}
              disabled={membersLoading || members.length === 0}
              onChange={(event) => {
                setMemberId(event.target.value);
                setAccounts([]);
                setLoans([]);
                setUnpaidMonths([]);
                setSelectedMonths([]);
                setLoanId('');
                setAccountId('');
                setAmount('');
              }}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">
                {membersLoading
                  ? 'Loading members...'
                  : entryType === 'loan_payment' && !members.length
                    ? 'No members with loans due'
                    : 'Select member'}
              </option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ')}{member.member_number ? ` (${member.member_number})` : ''}
                </option>
              ))}
            </select>
          </label>
          {visibleEntryTypes.length > 1 && (
            <label className="text-sm font-medium text-gray-700">
              Entry type *
              <select
                value={entryType}
                onChange={(event) => {
                  const nextType = entryTypes.find((type) => type.value === event.target.value);
                  setEntryType(event.target.value);
                  const defaultAccount = event.target.value.includes('withdrawal')
                    ? getDefaultAccount(accounts, nextType?.account)
                    : null;
                  const defaultLoan = event.target.value === 'loan_payment' ? selectedLoan || loans[0] : null;
                  setAmount(event.target.value === 'capital_contribution'
                    ? String(capitalAmount || '')
                    : defaultAccount
                      ? String(defaultAccount.balance || '')
                      : defaultLoan
                        ? String(getLoanScheduleSummary(defaultLoan)?.remainingDue || defaultLoan.balance || '')
                        : '');
                  setParticulars(event.target.value === 'loan_payment'
                    ? loanPaymentParticulars[0]
                    : nextType?.label || '');
                  setAccountId(defaultAccount?.id || '');
                  setLoanId(defaultLoan?.id || '');
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                {visibleEntryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-gray-700">
            Date *
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
            {entryType !== 'capital_contribution' && !selectedEntry?.dividend && (
            <label className="text-sm font-medium text-gray-700">
              Amount (₱) *
              <input
                type="number"
                min="0.01"
                max={entryType.includes('withdrawal') && selectedAccount ? selectedAccount.balance : undefined}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                aria-describedby={entryType.includes('withdrawal') ? 'withdrawal-amount-help' : undefined}
                className={`mt-1 w-full rounded-lg border px-3 py-2 ${exceedsSelectedAccountBalance ? 'border-red-400' : 'border-gray-300'}`}
              />
              {entryType.includes('withdrawal') && selectedAccount && (
                <span id="withdrawal-amount-help" className={`mt-1 block text-xs font-normal ${exceedsSelectedAccountBalance ? 'text-red-700' : 'text-gray-500'}`}>
                  Current account balance: {formatCurrency(selectedAccount.balance)}
                  {exceedsSelectedAccountBalance ? ' · Withdrawal exceeds the available balance.' : ' · Amount was prefilled with the available balance; edit it to the requested amount.'}
                </span>
              )}
            </label>
          )}
          {!selectedEntry?.dividend && <label className="text-sm font-medium text-gray-700">
            Particulars *
            {entryType === 'loan_payment' ? (
              <>
                <select value={particulars} onChange={(event) => setParticulars(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  {loanPaymentParticulars.map((particular) => <option key={particular}>{particular}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  The loan schedule determines how the payment is allocated to principal, interest, and penalties.
                </span>
              </>
            ) : (
              <input value={particulars} onChange={(event) => setParticulars(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            )}
          </label>}
        </div>
        </section>

        <MemberBalanceSummary
          memberId={memberId}
          accounts={accounts}
          loans={loans}
          isLoading={loadingMemberData}
        />

        {selectedEntry?.dividend && (
          <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div>
              <h3 className="font-semibold text-indigo-950">Approved worksheet amounts</h3>
              <p className="mt-1 text-xs text-indigo-800">
                Enter the approved amounts from the dividend sheet. The system checks that dividend + patronage − mortuary equals the member’s retention, savings, and loan allocations.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['dividend_amount', 'Dividend'],
                ['patronage_amount', 'Patronage'],
                ['mortuary_deduction', 'Mortuary deduction'],
                ['retention_amount', '50% retention to capital share'],
                ['savings_amount', 'Savings'],
                ['loan_payment_amount', 'Loan payment']
              ].map(([field, label]) => (
                <label key={field} className="text-sm font-medium text-gray-700">
                  {label} (₱)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dividendValues[field]}
                    onChange={(event) => setDividendValues((current) => ({ ...current, [field]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                  />
                </label>
              ))}
            </div>
            {Number(dividendValues.savings_amount) > 0 && (
              <label className="block max-w-xl text-sm font-medium text-gray-700">
                Credit savings account
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <option value="">Use or create the member’s regular savings account</option>
                  {accounts.filter((account) => account.account_type === 'regular').map((account) => <option key={account.id} value={account.id}>{account.account_number}</option>)}
                </select>
              </label>
            )}
            {Number(dividendValues.loan_payment_amount) > 0 && (
              <p className="text-sm text-indigo-900">
                Loan allocation applies to the oldest active loan{selectedLoan ? ` ${selectedLoan.loan_number}` : ''}.
              </p>
            )}
            <div className={`rounded-lg p-3 text-sm font-medium ${dividendBalanced ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
              Available after mortuary: ₱{dividendAvailable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              {' · '}Allocated: ₱{dividendAllocated.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              {' · '}{dividendBalanced ? 'Balanced' : 'Amounts do not balance'}
            </div>
          </div>
        )}

        {selectedEntry?.receipt && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm font-medium text-gray-700">Payment method</span>
              <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">Cash</p>
            </div>
            <label className="text-sm font-medium text-gray-700">
              Received into
              <select value={cashAccount} onChange={(event) => setCashAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option>Cash on Hand</option>
                <option>Cash in Bank</option>
              </select>
            </label>
          </div>
        )}

        {!selectedEntry?.receipt && !selectedEntry?.dividend && (
          <label className="block max-w-sm text-sm font-medium text-gray-700">
            Paid from
            <select value={cashAccount} onChange={(event) => setCashAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option>Cash on Hand</option>
              <option>Cash in Bank</option>
            </select>
          </label>
        )}

        {entryType.includes('withdrawal') && (
          <label className="block max-w-xl text-sm font-medium text-gray-700">
            Member account *
            <select
              value={accountId}
              onChange={(event) => {
                const nextAccount = matchingAccounts.find((account) => account.id === event.target.value);
                setAccountId(event.target.value);
                if (nextAccount) setAmount(String(nextAccount.balance || ''));
              }}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Select account</option>
              {matchingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_number} — ₱{Number(account.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </label>
        )}

        {entryType === 'loan_payment' && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <label className="block text-sm font-medium text-gray-800">
              Existing loan *
              <select
                value={loanId}
                onChange={(event) => {
                  const nextLoan = loans.find((loan) => loan.id === event.target.value);
                  setLoanId(event.target.value);
                  if (nextLoan) setAmount(String(getLoanScheduleSummary(nextLoan)?.remainingDue || nextLoan.balance || ''));
                }}
                required
                disabled={loadingMemberData || !loans.length}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="">Select loan</option>
                {loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.loan_number} — balance ₱{Number(loan.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</option>)}
              </select>
            </label>
            <p className="text-sm text-blue-900">
              {loadingMemberData ? 'Loading the member’s active loans...' : selectedLoan
                ? `Payment applies to ${selectedLoan.loan_number}. Principal, interest, and any scheduled penalties are allocated against its oldest unpaid installments.`
                : 'This member has no active loan with an outstanding balance.'}
            </p>
            {selectedLoan && selectedLoanSummary && (
              <div className="space-y-2 rounded-md border border-blue-100 bg-white p-3 text-sm text-gray-800">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">
                    {selectedLoan.payment_frequency === 'weekly' ? 'Weekly installment' : 'Monthly installment'}
                  </span>
                  <span className="font-semibold">{formatCurrency(selectedLoanSummary.installmentAmount)}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>
                    Principal {formatCurrency(selectedLoanSummary.principalPerInstallment)}
                    {' · '}Interest {formatCurrency(selectedLoanSummary.interestPerInstallment)}
                    {' · '}{Number(selectedLoan.interest_rate || 0)}% annual
                  </span>
                  <span>
                    {selectedLoan.term_months} months
                    {' · '}{selectedLoanSummary.installments} {selectedLoan.payment_frequency || 'monthly'} installments
                  </span>
                </div>
                {selectedLoanSummary.oldestUnpaid ? (
                  <div className="border-t border-blue-100 pt-2">
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span>
                        Oldest unpaid installment #{selectedLoanSummary.oldestUnpaid.installment_number}
                        {' · '}due {new Date(`${selectedLoanSummary.oldestUnpaid.due_date}T00:00:00`).toLocaleDateString('en-PH')}
                      </span>
                      <span className="font-semibold">{formatCurrency(selectedLoanSummary.remainingDue)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      Remaining principal {formatCurrency(selectedLoanSummary.remainingPrincipal)}
                      {' · '}interest {formatCurrency(selectedLoanSummary.remainingInterest)}
                      {' · '}penalty {formatCurrency(selectedLoanSummary.openPenalty)}
                    </p>
                  </div>
                ) : (
                  <p className="border-t border-blue-100 pt-2 text-xs text-gray-600">
                    No unpaid installment details are available{navigator.onLine && !offlineMode ? '.' : ' offline; reconnect to load the current schedule.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {entryType === 'capital_contribution' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Unpaid monthly capital contributions — ₱100 each</p>
            {loadingMemberData ? <p className="mt-2 text-sm text-gray-600">Loading due months...</p> : unpaidMonths.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">There are no unpaid months through the current month.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {unpaidMonths.map((month) => (
                  <label key={month} className="flex items-center gap-2 rounded border border-emerald-100 bg-white p-2 text-sm">
                    <input type="checkbox" checked={selectedMonths.includes(month)} onChange={() => handleMonthToggle(month)} />
                    {new Date(`${month}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm font-semibold text-emerald-900">
              Total: ₱{capitalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {entryType === 'time_deposit' && (
          <>
            <section className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/70 p-4 sm:p-5">
              <div>
                <h3 className="font-semibold text-teal-950">Time deposit terms</h3>
                <p className="mt-1 text-xs text-teal-900">Choose an offered term or enter a custom maturity date. The rate remains staff-entered until an approved rate policy is configured.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium text-gray-700">
                  Deposit term *
                  <select value={depositTerm} onChange={(event) => setDepositTerm(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Annual interest rate (%) *
                  <input type="number" min="0" step="0.01" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Maturity date *
                  <input
                    type="date"
                    min={date}
                    value={maturityDate}
                    onChange={(event) => setCustomMaturityDate(event.target.value)}
                    readOnly={depositTerm !== 'custom'}
                    required
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 read-only:bg-gray-100"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-teal-100 bg-white p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-gray-600">Estimated interest · {depositDays > 0 ? `${depositDays} days` : 'enter valid dates'}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(estimatedInterest)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Estimated maturity amount</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(estimatedMaturityAmount)}</p>
                </div>
                <p className="text-xs text-gray-500 sm:col-span-2">
                  {estimateIsValid
                    ? 'Estimate uses simple interest and actual days ÷ 365. Taxes, rounding rules, and any other adjustments remain subject to cooperative policy.'
                    : 'Enter a positive amount, a valid rate, and a maturity date after placement to see an estimate.'}
                </p>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div>
                <h3 className="font-semibold text-slate-900">Instructions at maturity</h3>
                <p className="mt-1 text-xs text-slate-600">This records the member’s preference only. Renewal or release still requires the cooperative’s normal authorization.</p>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Maturity instruction *
                <select value={maturityInstruction} onChange={(event) => setMaturityInstruction(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  {maturityInstructionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {(!navigator.onLine || offlineMode)
                  ? 'Manager approval is not required. Submitting confirms the funds have been received; the receipt and active deposit will be created after the entry syncs successfully.'
                  : 'Manager approval is not required. Submitting confirms the funds have been received, records the receipt, and activates the deposit.'}
              </p>
            </section>
          </>
        )}

        {entryType === 'savings_deposit' && (
          <label className="block max-w-xl text-sm font-medium text-gray-700">
            Credit to account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option value="">Use or create the member’s first active account</option>
              {matchingAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_number} — ₱{Number(account.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</option>)}
            </select>
          </label>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to transaction types
          </button>
          <button type="submit" disabled={saving || loadingMemberData} className="rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60">
            {saving ? 'Submitting...' : entryType === 'time_deposit' ? 'Submit Time Deposit Placement' : 'Record member entry'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MemberFinancialEntryForm;

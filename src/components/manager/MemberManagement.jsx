import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Eye, Search, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

const fullName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');

const formatDate = (value) => {
  if (!value) return 'Not recorded';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getInstallmentBalance = (schedule) => Math.max(
  0,
  Number(schedule.amount_due || 0) + Number(schedule.penalty_amount || 0) - Number(schedule.amount_paid || 0)
);

const MemberManagement = () => {
  const [members, setMembers] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberLoans, setMemberLoans] = useState([]);
  const [loanSchedules, setLoanSchedules] = useState([]);
  const [loanPayments, setLoanPayments] = useState([]);
  const [loanDetailsLoading, setLoanDetailsLoading] = useState(false);
  const [loanDetailsError, setLoanDetailsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedMember) return undefined;

    let active = true;
    const loadLoanDetails = async () => {
      try {
        const { data: loans, error: loansError } = await supabase
          .from('loans')
          .select('id, loan_number, loan_product_id, principal_amount, interest_rate, term_months, payment_frequency, monthly_payment, installment_amount, total_interest, total_amount, balance, application_date, approval_date, release_date, maturity_date, status, notes')
          .eq('member_id', selectedMember.id)
          .order('created_at', { ascending: false });

        if (loansError) throw loansError;
        const loanIds = (loans || []).map((loan) => loan.id);
        let schedules = [];
        let payments = [];

        if (loanIds.length > 0) {
          const [schedulesResult, paymentsResult] = await Promise.all([
            supabase
              .from('loan_schedule')
              .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status, paid_at')
              .in('loan_id', loanIds)
              .order('due_date', { ascending: true }),
            supabase
              .from('loan_payments')
              .select('id, loan_id, payment_number, payment_date, amount_paid, principal_paid, interest_paid, penalty_paid, balance_after, payment_method, reference_number, receipt_id')
              .in('loan_id', loanIds)
              .eq('status', 'recorded')
              .order('payment_date', { ascending: false })
          ]);

          if (schedulesResult.error) throw schedulesResult.error;
          if (paymentsResult.error) throw paymentsResult.error;
          schedules = schedulesResult.data || [];
          payments = paymentsResult.data || [];
        }

        if (!active) return;
        setMemberLoans(loans || []);
        setLoanSchedules(schedules);
        setLoanPayments(payments);
      } catch (loadError) {
        console.error('Unable to load member loan details:', loadError);
        if (active) setLoanDetailsError('Loan details could not be loaded. Please try again.');
      } finally {
        if (active) setLoanDetailsLoading(false);
      }
    };

    loadLoanDetails();
    return () => {
      active = false;
    };
  }, [selectedMember]);

  const openMemberDetails = (member) => {
    setSelectedMember(member);
    setMemberLoans([]);
    setLoanSchedules([]);
    setLoanPayments([]);
    setLoanDetailsError('');
    setLoanDetailsLoading(true);
  };

  const loadMembers = useCallback(async () => {
    try {
      const [membersResult, archivedResult, accountsResult, loansResult] = await Promise.all([
        supabase
          .from('members')
          .select('id, member_number, first_name, middle_name, last_name, email, phone, address, date_joined, membership_status, membership_type, gender, occupation, emergency_contact_name, emergency_contact_phone')
          .is('archived_at', null)
          .in('membership_status', ['active', 'suspended'])
          .order('last_name', { ascending: true }),
        supabase
          .from('archived_members')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('savings_accounts')
          .select('member_id, account_type, balance')
          .eq('status', 'active'),
        supabase
          .from('loans')
          .select('member_id, balance')
          .in('status', ['approved', 'active'])
      ]);

      if (membersResult.error) throw membersResult.error;
      if (archivedResult.error) throw archivedResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (loansResult.error) throw loansResult.error;

      const totals = {};
      const totalsFor = (id) => (totals[id] ||= { savings: 0, loan: 0, timeDeposit: 0 });
      (accountsResult.data || []).forEach((account) => {
        const entry = totalsFor(account.member_id);
        const key = account.account_type === 'time_deposit' ? 'timeDeposit' : 'savings';
        entry[key] += Number(account.balance || 0);
      });
      (loansResult.data || []).forEach((loan) => {
        totalsFor(loan.member_id).loan += Number(loan.balance || 0);
      });

      setMembers((membersResult.data || []).map((member) => ({
        ...member,
        savings_total: totals[member.id]?.savings || 0,
        loan_balance: totals[member.id]?.loan || 0,
        time_deposit_total: totals[member.id]?.timeDeposit || 0
      })));
      setArchivedCount(archivedResult.count || 0);
      setError('');
    } catch (loadError) {
      console.error('Unable to load member records:', loadError);
      setError('Member records could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useRealtimeSubscription('members', loadMembers, null, [loadMembers]);
  useRealtimeSubscription('archived_members', loadMembers, null, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return members;

    return members.filter((member) => [
      fullName(member),
      member.member_number,
      member.email,
      member.phone,
      member.address
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
  }, [members, searchTerm]);

  const activeMembers = members.filter((member) => member.membership_status === 'active').length;
  const joinedThisMonth = members.filter((member) => {
    if (!member.date_joined) return false;
    const date = new Date(`${member.date_joined}T00:00:00`);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;

  const statCards = [
    { label: 'Total Members', value: members.length, Icon: Users, iconClass: 'bg-blue-50 text-blue-700' },
    { label: 'Active Members', value: activeMembers, Icon: UserCheck, iconClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'New This Month', value: joinedThisMonth, Icon: UserPlus, iconClass: 'bg-violet-50 text-violet-700' },
    { label: 'Archived Members', value: archivedCount, Icon: Users, iconClass: 'bg-slate-100 text-slate-600' }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, Icon, iconClass }) => (
          <section key={label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
              </div>
              <span className={`flex size-12 items-center justify-center rounded-xl ${iconClass}`}>
                <Icon className="size-6" aria-hidden="true" />
              </span>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <label htmlFor="member-search" className="mb-2 block text-sm font-medium text-gray-700">
          Find a member
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            id="member-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, member ID, email, or contact number"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading members...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto size-10 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-700">No members found</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Member directory</h2>
              <p className="text-sm text-gray-500">
                {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Member</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Membership</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Savings</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Loan balance</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Time deposits</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="odd:bg-white even:bg-gray-50/60 hover:bg-blue-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{fullName(member)}</p>
                        <p className="mt-1 text-xs text-gray-500">ID: {member.member_number || 'Not assigned'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-800">{member.phone || 'No contact number'}</p>
                        <p className="mt-1 max-w-[220px] truncate text-xs text-gray-500" title={member.email || ''}>{member.email || 'No email address'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${member.membership_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {member.membership_status}
                        </span>
                        <p className="mt-1 text-xs capitalize text-gray-500">{member.membership_type || 'Type not recorded'}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-gray-800">{formatMoney(member.savings_total)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(member.loan_balance)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-gray-800">{formatMoney(member.time_deposit_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openMemberDetails(member)}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                          <Eye className="size-4" aria-hidden="true" />
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-details-title" className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <header className="sticky top-0 z-20 flex items-start justify-between border-b border-gray-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
              <div>
                <h2 id="member-details-title" className="text-xl font-semibold text-gray-900">{fullName(selectedMember)}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span>Member ID: {selectedMember.member_number || 'Not assigned'}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${selectedMember.membership_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {selectedMember.membership_status}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close member details">
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>
            <details className="border-b border-gray-200">
              <summary className="group flex cursor-pointer list-none items-center justify-between bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100">
                Member profile details
                <span className="text-xs font-medium text-blue-700 group-open:hidden">Expand profile</span>
                <span className="hidden text-xs font-medium text-blue-700 group-open:inline">Hide profile</span>
              </summary>
              <section aria-label="Member information" className="px-6 py-5">
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Member information</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Details</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Member information</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      [
                        ['Savings', formatMoney(selectedMember.savings_total)],
                        ['Loan balance', formatMoney(selectedMember.loan_balance)]
                      ],
                      [
                        ['Time deposits', formatMoney(selectedMember.time_deposit_total)],
                        ['Status', selectedMember.membership_status]
                      ],
                      [
                        ['Membership type', selectedMember.membership_type],
                        ['Date joined', formatDate(selectedMember.date_joined)]
                      ],
                      [
                        ['Gender', selectedMember.gender],
                        ['Phone', selectedMember.phone]
                      ],
                      [
                        ['Email', selectedMember.email],
                        ['Address', selectedMember.address]
                      ],
                      [
                        ['Occupation', selectedMember.occupation],
                        ['Emergency contact', selectedMember.emergency_contact_name]
                      ],
                      [
                        ['Emergency contact number', selectedMember.emergency_contact_phone],
                        ['', '']
                      ]
                    ].map((row, index) => (
                      <tr key={index} className="odd:bg-white even:bg-gray-50/60">
                        {row.map(([label, value], cellIndex) => (
                          <Fragment key={cellIndex}>
                            <th scope="row" className="w-1/4 px-4 py-3 text-left font-medium text-gray-600">{label}</th>
                            <td className="w-1/4 break-words px-4 py-3 text-gray-900">{value || 'Not recorded'}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </section>
            </details>
            <section aria-labelledby="member-loans-title" className="border-t border-gray-200 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="member-loans-title" className="text-lg font-semibold text-gray-900">Loans and repayments</h3>
                    <p className="mt-1 text-sm text-gray-500">Loan status, outstanding installments, due dates, and recorded payments.</p>
                  </div>
                  {!loanDetailsLoading && !loanDetailsError && (
                    <p className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
                      {memberLoans.length} {memberLoans.length === 1 ? 'loan' : 'loans'}
                    </p>
                  )}
              </div>

              {loanDetailsLoading ? (
                  <p className="mt-5 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">Loading loan and repayment details...</p>
              ) : loanDetailsError ? (
                  <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loanDetailsError}</p>
              ) : memberLoans.length === 0 ? (
                  <p className="mt-5 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">No loans recorded for this member.</p>
              ) : (() => {
                  const today = getToday();
                  const outstandingSchedules = loanSchedules.filter((schedule) => getInstallmentBalance(schedule) > 0);
                  const overdueSchedules = outstandingSchedules.filter((schedule) => schedule.due_date < today);
                  const upcomingSchedules = outstandingSchedules.filter((schedule) => schedule.due_date >= today);
                  const nextInstallment = outstandingSchedules[0];
                  const overdueTotal = overdueSchedules.reduce((total, schedule) => total + getInstallmentBalance(schedule), 0);
                  const upcomingTotal = upcomingSchedules.reduce((total, schedule) => total + getInstallmentBalance(schedule), 0);
                  const activeLoanBalance = memberLoans
                    .filter((loan) => ['approved', 'active'].includes(loan.status))
                    .reduce((total, loan) => total + Number(loan.balance || 0), 0);

                  const schedulesForLoan = (loanId) => loanSchedules.filter((schedule) => schedule.loan_id === loanId);
                  const paymentsForLoan = (loanId) => loanPayments.filter((payment) => payment.loan_id === loanId);

                  return (
                    <div className="mt-5 space-y-5">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Outstanding loan balance</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">{formatMoney(activeLoanBalance)}</p>
                        </div>
                        <div className={`rounded-lg border p-4 ${overdueSchedules.length ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Overdue installments</p>
                          <p className={`mt-1 text-lg font-semibold ${overdueSchedules.length ? 'text-red-800' : 'text-gray-900'}`}>
                            {overdueSchedules.length} · {formatMoney(overdueTotal)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Upcoming installments</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">{upcomingSchedules.length} · {formatMoney(upcomingTotal)}</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Next payment due</p>
                          <p className="mt-1 text-lg font-semibold text-blue-900">{nextInstallment ? formatMoney(getInstallmentBalance(nextInstallment)) : 'None scheduled'}</p>
                          {nextInstallment && <p className="mt-1 text-xs text-blue-800">{formatDate(nextInstallment.due_date)}</p>}
                        </div>
                      </div>

                      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${overdueSchedules.length ? 'border-red-200 bg-red-50 text-red-900' : nextInstallment ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                        {overdueSchedules.length ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : nextInstallment ? <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                        <p>
                          <span className="font-semibold">Suggested follow-up: </span>
                          {overdueSchedules.length
                            ? `Review ${overdueSchedules.length} overdue ${overdueSchedules.length === 1 ? 'installment' : 'installments'} with the member and confirm the remaining ${formatMoney(overdueTotal)}.`
                            : nextInstallment
                              ? `Remind the member about the next ${formatMoney(getInstallmentBalance(nextInstallment))} payment due ${formatDate(nextInstallment.due_date)}.`
                              : 'No unpaid installments are scheduled. Review the loan history below if the member has questions.'}
                        </p>
                      </div>

                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                          <h4 className="text-sm font-semibold text-gray-800">Loan overview</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1050px] text-left text-sm">
                            <thead className="bg-white text-xs uppercase tracking-wide text-gray-500">
                              <tr>
                                <th scope="col" className="px-4 py-3 font-semibold">Loan</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Principal / total</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Balance</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Installment</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Next unpaid due</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Key dates</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {memberLoans.map((loan) => {
                                const schedule = schedulesForLoan(loan.id);
                                const nextDue = schedule.find((installment) => getInstallmentBalance(installment) > 0);
                                const statusClass = loan.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : loan.status === 'completed'
                                    ? 'bg-slate-200 text-slate-700'
                                    : loan.status === 'rejected' || loan.status === 'written_off'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800';

                                return (
                                  <tr key={loan.id} className="align-top odd:bg-white even:bg-gray-50/60">
                                    <td className="px-4 py-3">
                                      <p className="font-semibold text-gray-900">{loan.loan_number || 'Loan'}</p>
                                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass}`}>
                                        {(loan.status || 'unknown').replaceAll('_', ' ')}
                                      </span>
                                      <p className="mt-1 text-xs text-gray-500">
                                        {loan.payment_frequency || 'Frequency unavailable'} · {loan.term_months || '—'} months · {loan.interest_rate ?? '—'}%
                                      </p>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                                      <p>{formatMoney(loan.principal_amount)}</p>
                                      <p className="mt-1 text-xs text-gray-500">Total {formatMoney(loan.total_amount)}</p>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-900">{formatMoney(loan.balance)}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatMoney(loan.installment_amount || loan.monthly_payment)}</td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                      {nextDue ? (
                                        <>
                                          <p className={`font-semibold ${nextDue.due_date < today ? 'text-red-700' : nextDue.due_date === today ? 'text-amber-700' : 'text-gray-900'}`}>
                                            {formatMoney(getInstallmentBalance(nextDue))}
                                          </p>
                                          <p className="mt-1 text-xs text-gray-600">{formatDate(nextDue.due_date)}</p>
                                          <p className={`mt-1 text-xs font-medium ${nextDue.due_date < today ? 'text-red-700' : nextDue.due_date === today ? 'text-amber-700' : 'text-blue-700'}`}>
                                            {nextDue.due_date < today ? 'Overdue' : nextDue.due_date === today ? 'Due today' : 'Upcoming'}
                                          </p>
                                        </>
                                      ) : <span className="text-gray-500">No unpaid dues</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600">
                                      <p>Applied {formatDate(loan.application_date)}</p>
                                      <p className="mt-1">Released {formatDate(loan.release_date)}</p>
                                      <p className="mt-1">Matures {formatDate(loan.maturity_date)}</p>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {memberLoans.map((loan) => {
                          const schedule = schedulesForLoan(loan.id);
                          const payments = paymentsForLoan(loan.id);
                          return (
                            <details key={loan.id} open={memberLoans.length === 1} className="group overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-3 marker:hidden hover:bg-gray-100">
                                <span className="font-semibold text-gray-800">
                                  {loan.loan_number || 'Loan'} · Repayment schedule and payment history
                                </span>
                                <span className="text-xs font-medium text-blue-700 group-open:hidden">Show details</span>
                                <span className="hidden text-xs font-medium text-blue-700 group-open:inline">Hide details</span>
                              </summary>
                              <div className="grid gap-5 border-t border-gray-200 p-4 xl:grid-cols-2">
                                <section aria-label={`Repayment schedule for ${loan.loan_number || 'loan'}`} className="min-w-0">
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">Repayment schedule</h5>
                                    <span className="text-xs text-gray-500">{schedule.length} installments</span>
                                  </div>
                                  {schedule.length === 0 ? (
                                    <p className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">No installment schedule recorded.</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-md border border-gray-200">
                                      <table className="w-full min-w-[480px] text-left text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                          <tr>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Due date</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Due</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Paid</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Remaining</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {schedule.map((installment) => {
                                            const remaining = getInstallmentBalance(installment);
                                            const status = remaining === 0 ? 'paid' : installment.due_date < today ? 'overdue' : installment.due_date === today ? 'due today' : 'upcoming';
                                            const statusClass = status === 'overdue'
                                              ? 'bg-red-100 text-red-800'
                                              : status === 'paid'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : status === 'due today'
                                                  ? 'bg-amber-100 text-amber-800'
                                                  : 'bg-blue-100 text-blue-800';
                                            return (
                                              <tr key={installment.id} className="odd:bg-white even:bg-gray-50/60">
                                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{formatDate(installment.due_date)}</td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{formatMoney(Number(installment.amount_due || 0) + Number(installment.penalty_amount || 0))}</td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{formatMoney(installment.amount_paid)}</td>
                                                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-900">{formatMoney(remaining)}</td>
                                                <td className="px-3 py-2.5">
                                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass}`}>{status}</span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </section>

                                <section aria-label={`Recorded payments for ${loan.loan_number || 'loan'}`} className="min-w-0">
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">Recorded payments</h5>
                                    <span className="text-xs text-gray-500">{payments.length} payments</span>
                                  </div>
                                  {payments.length === 0 ? (
                                    <p className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">No recorded payments.</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-md border border-gray-200">
                                      <table className="w-full min-w-[450px] text-left text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                          <tr>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Amount</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Principal / interest</th>
                                            <th scope="col" className="px-3 py-2.5 font-semibold">Reference</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {payments.map((payment) => (
                                            <tr key={payment.id} className="odd:bg-white even:bg-gray-50/60">
                                              <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{formatDate(payment.payment_date)}</td>
                                              <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-900">{formatMoney(payment.amount_paid)}</td>
                                              <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{formatMoney(payment.principal_paid)} / {formatMoney(payment.interest_paid)}</td>
                                              <td className="break-all px-3 py-2.5 text-gray-700">{payment.reference_number || payment.payment_method || 'Not recorded'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </section>
                              </div>
                              {loan.notes && (
                                <p className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                                  <span className="font-semibold">Loan notes: </span>{loan.notes}
                                </p>
                              )}
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  );
              })()}
            </section>
            <footer className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button type="button" onClick={() => setSelectedMember(null)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default MemberManagement;

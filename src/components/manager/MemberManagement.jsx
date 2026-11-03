import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Eye, HandCoins, Landmark, Printer, Search, UserCheck, UserPlus, Users, Wallet, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import MemberReportSort from '../common/MemberReportSort';
import { sortMemberReportRows } from '../common/memberReportSorting';

const fullName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');

const formatDate = (value) => {
  if (!value) return 'Not recorded';
  const date = String(value).length > 10 ? new Date(value) : new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-PH', {
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

const toTimelineRows = ({ loans, payments, savingsTransactions, activity }) => {
  const knownReferences = new Set([
    ...payments.map((payment) => payment.reference_number).filter(Boolean),
    ...savingsTransactions.map((transaction) => transaction.reference_number).filter(Boolean)
  ]);
  const rows = [
    ...loans.filter((loan) => loan.release_date).map((loan) => ({
      id: `release-${loan.id}`,
      date: loan.release_date,
      type: 'Loan released',
      description: loan.loan_number || 'Loan',
      amount: Number(loan.principal_amount || 0),
      amountLabel: 'Disbursed',
      reference: loan.loan_number
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.payment_date,
      type: 'Loan payment',
      description: `Principal ${formatMoney(payment.principal_paid)} · Interest ${formatMoney(payment.interest_paid)}`,
      amount: -Number(payment.amount_paid || 0),
      amountLabel: 'Paid',
      reference: payment.reference_number || payment.payment_method || 'Not recorded'
    })),
    ...savingsTransactions.map((transaction) => {
      const isWithdrawal = ['withdrawal', 'fee'].includes(transaction.transaction_type);
      return {
        id: `savings-${transaction.id}`,
        date: transaction.transaction_date,
        type: `${transaction.account_type === 'time_deposit' ? 'Time deposit' : 'Savings'} ${transaction.transaction_type}`,
        description: transaction.description || 'Savings account transaction',
        amount: Number(transaction.amount || 0) * (isWithdrawal ? -1 : 1),
        amountLabel: isWithdrawal ? 'Outflow' : 'Inflow',
        reference: transaction.reference_number || 'Not recorded'
      };
    }),
    ...activity
      .filter((item) => !item.voided_at && (!item.reference || !knownReferences.has(item.reference)))
      .map((item) => ({
        id: `activity-${item.id}`,
        date: item.created_at,
        type: item.title,
        description: item.note || item.activity_type,
        amount: Number(item.amount || 0),
        amountLabel: item.is_discrepancy ? 'Review' : 'Activity',
        reference: item.reference || 'Not recorded'
      }))
  ];

  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
};

const MemberManagement = () => {
  const [members, setMembers] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [memberSort, setMemberSort] = useState('newest');
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedFinancialRecord, setSelectedFinancialRecord] = useState(null);
  const [memberLoans, setMemberLoans] = useState([]);
  const [loanSchedules, setLoanSchedules] = useState([]);
  const [loanPayments, setLoanPayments] = useState([]);
  const [memberTimeline, setMemberTimeline] = useState([]);
  const [loanDetailsLoading, setLoanDetailsLoading] = useState(false);
  const [loanDetailsError, setLoanDetailsError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [statementStart, setStatementStart] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [statementEnd, setStatementEnd] = useState(getToday());
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
        let savingsTransactions = [];
        let activity = [];

        const [schedulesResult, paymentsResult, savingsResult, activityResult] = await Promise.all([
          loanIds.length > 0
            ? supabase
              .from('loan_schedule')
              .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status, paid_at')
              .in('loan_id', loanIds)
              .order('due_date', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          loanIds.length > 0
            ? supabase
              .from('loan_payments')
              .select('id, loan_id, payment_number, payment_date, amount_paid, principal_paid, interest_paid, penalty_paid, balance_after, payment_method, reference_number, receipt_id')
              .in('loan_id', loanIds)
              .eq('status', 'recorded')
              .order('payment_date', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('savings_transactions')
            .select('id, transaction_type, amount, transaction_date, description, reference_number, savings_accounts!inner(member_id, account_type)')
            .eq('savings_accounts.member_id', selectedMember.id)
            .eq('status', 'recorded')
            .order('transaction_date', { ascending: false }),
          supabase
            .from('member_activity')
            .select('id, activity_type, title, amount, reference, note, is_discrepancy, created_at, voided_at')
            .eq('member_id', selectedMember.id)
            .order('created_at', { ascending: false })
        ]);

        if (schedulesResult.error) throw schedulesResult.error;
        if (paymentsResult.error) throw paymentsResult.error;
        if (savingsResult.error) throw savingsResult.error;
        if (activityResult.error) throw activityResult.error;
        schedules = schedulesResult.data || [];
        payments = paymentsResult.data || [];
        savingsTransactions = (savingsResult.data || []).map((transaction) => ({
          ...transaction,
          account_type: Array.isArray(transaction.savings_accounts)
            ? transaction.savings_accounts[0]?.account_type
            : transaction.savings_accounts?.account_type
        }));
        activity = activityResult.data || [];

        if (!active) return;
        setMemberLoans(loans || []);
        setLoanSchedules(schedules);
        setLoanPayments(payments);
        setMemberTimeline(toTimelineRows({ loans: loans || [], payments, savingsTransactions, activity }));
        setLoanDetailsError('');
        setTimelineError('');
      } catch (loadError) {
        console.error('Unable to load member loan details:', loadError);
        if (active) {
          setLoanDetailsError('Member financial details could not be loaded. Please try again.');
          setTimelineError('The financial timeline and statement could not be loaded.');
        }
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
    setMemberTimeline([]);
    setLoanDetailsError('');
    setTimelineError('');
    setLoanDetailsLoading(true);
  };

  const openFinancialRecord = (title, details) => {
    setSelectedFinancialRecord({ title, details });
  };

  const openLoanRecord = (loan, nextDue) => openFinancialRecord(`Loan ${loan.loan_number || ''}`.trim(), [
    ['Loan number', loan.loan_number],
    ['Status', loan.status?.replaceAll('_', ' ')],
    ['Principal amount', formatMoney(loan.principal_amount)],
    ['Total amount', formatMoney(loan.total_amount)],
    ['Outstanding balance', formatMoney(loan.balance)],
    ['Installment amount', formatMoney(loan.installment_amount || loan.monthly_payment)],
    ['Interest rate', loan.interest_rate === null ? 'Not recorded' : `${loan.interest_rate}%`],
    ['Payment frequency', loan.payment_frequency],
    ['Term', loan.term_months ? `${loan.term_months} months` : 'Not recorded'],
    ['Next unpaid due', nextDue ? formatDate(nextDue.due_date) : 'No unpaid dues'],
    ['Next installment balance', nextDue ? formatMoney(getInstallmentBalance(nextDue)) : '—'],
    ['Application date', formatDate(loan.application_date)],
    ['Approval date', formatDate(loan.approval_date)],
    ['Release date', formatDate(loan.release_date)],
    ['Maturity date', formatDate(loan.maturity_date)],
    ...(loan.notes ? [['Loan notes', loan.notes]] : [])
  ]);
  const openInstallmentRecord = (loan, installment, status, remaining) => openFinancialRecord(`Installment ${installment.installment_number}`, [
    ['Loan number', loan.loan_number],
    ['Installment number', installment.installment_number],
    ['Due date', formatDate(installment.due_date)],
    ['Status', status],
    ['Amount due', formatMoney(installment.amount_due)],
    ['Penalty amount', formatMoney(installment.penalty_amount)],
    ['Total due', formatMoney(Number(installment.amount_due || 0) + Number(installment.penalty_amount || 0))],
    ['Amount paid', formatMoney(installment.amount_paid)],
    ['Remaining balance', formatMoney(remaining)],
    ['Paid date', formatDate(installment.paid_at)]
  ]);
  const openPaymentRecord = (loan, payment) => openFinancialRecord(`Payment ${payment.payment_number || ''}`.trim(), [
    ['Loan number', loan.loan_number],
    ['Payment number', payment.payment_number],
    ['Payment date', formatDate(payment.payment_date)],
    ['Total paid', formatMoney(payment.amount_paid)],
    ['Principal paid', formatMoney(payment.principal_paid)],
    ['Interest paid', formatMoney(payment.interest_paid)],
    ['Penalty paid', formatMoney(payment.penalty_paid)],
    ['Balance after payment', formatMoney(payment.balance_after)],
    ['Payment method', payment.payment_method],
    ['Reference number', payment.reference_number],
    ['Receipt ID', payment.receipt_id]
  ]);
  const openStatementRecord = (item) => openFinancialRecord(item.type, [
    ['Activity', item.type],
    ['Date', formatDate(item.date)],
    ['Description', item.description],
    ['Reference', item.reference],
    ['Amount', formatMoney(Math.abs(item.amount))],
    ['Direction', item.amount < 0 ? 'Outflow' : 'Inflow'],
    ['Activity label', item.amountLabel]
  ]);
  const activateRowFromKeyboard = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
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
    const matchingMembers = !normalizedSearch ? members : members.filter((member) => [
      fullName(member),
      member.member_number,
      member.email,
      member.phone,
      member.address
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
    return sortMemberReportRows(matchingMembers, memberSort);
  }, [members, memberSort, searchTerm]);

  const statementRows = useMemo(() => {
    if (!statementStart || !statementEnd || statementStart > statementEnd) return [];
    return memberTimeline.filter((item) => {
      const date = String(item.date || '').slice(0, 10);
      return date >= statementStart && date <= statementEnd;
    });
  }, [memberTimeline, statementEnd, statementStart]);

  const overdueInstallments = loanSchedules.filter(
    (schedule) => schedule.due_date < getToday() && getInstallmentBalance(schedule) > 0
  );
  const overdueBalance = overdueInstallments.reduce((sum, schedule) => sum + getInstallmentBalance(schedule), 0);

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
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
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
          </div>
          <MemberReportSort value={memberSort} onChange={setMemberSort} id="manager-directory-sort" />
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
                    <tr
                      key={member.id}
                      tabIndex={0}
                      aria-label={`View member details for ${fullName(member)}`}
                      onClick={() => openMemberDetails(member)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openMemberDetails(member);
                        }
                      }}
                      className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                    >
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
                          onClick={(event) => { event.stopPropagation(); openMemberDetails(member); }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="member-details-title" className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl">
            <header className="z-20 flex flex-none items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-white px-5 py-4 sm:px-7">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-12 flex-none items-center justify-center rounded-2xl bg-[#183b34] text-lg font-bold text-white shadow-sm">
                  {`${selectedMember.first_name?.[0] || ''}${selectedMember.last_name?.[0] || ''}`.toUpperCase() || <Users className="size-5" aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Member profile</p>
                  <h2 id="member-details-title" className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900">{fullName(selectedMember)}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>ID {selectedMember.member_number || 'Not assigned'}</span>
                    <span aria-hidden="true" className="text-slate-300">•</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${selectedMember.membership_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      <span className={`size-1.5 rounded-full ${selectedMember.membership_status === 'active' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                      {selectedMember.membership_status}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="flex size-10 flex-none items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label="Close member details">
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <section aria-label="Member financial summary" className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Savings balance', value: selectedMember.savings_total, Icon: Wallet, tone: 'bg-blue-50 text-blue-700' },
                { label: 'Outstanding loan', value: selectedMember.loan_balance, Icon: HandCoins, tone: 'bg-violet-50 text-violet-700' },
                { label: 'Time deposits', value: selectedMember.time_deposit_total, Icon: Landmark, tone: 'bg-emerald-50 text-emerald-700' }
              ].map(({ label, value, Icon, tone }) => (
                <article key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatMoney(value)}</p>
                  </div>
                  <span className={`flex size-10 flex-none items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                </article>
              ))}
            </section>
            <details className="border-b border-gray-200">
              <summary className="group mt-5 flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300">
                <span>
                  <span className="block">Personal and contact information</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">Membership details and emergency contact</span>
                </span>
                <span className="flex-none text-xs font-semibold text-emerald-700 group-open:hidden">Show details</span>
                <span className="hidden flex-none text-xs font-semibold text-emerald-700 group-open:inline">Hide details</span>
              </summary>
              <section aria-label="Member information" className="pt-4">
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['Membership type', selectedMember.membership_type],
                    ['Date joined', formatDate(selectedMember.date_joined)],
                    ['Gender', selectedMember.gender],
                    ['Phone', selectedMember.phone],
                    ['Email', selectedMember.email],
                    ['Address', selectedMember.address],
                    ['Occupation', selectedMember.occupation],
                    ['Emergency contact', selectedMember.emergency_contact_name],
                    ['Emergency contact number', selectedMember.emergency_contact_phone]
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <dt className="text-xs font-medium text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not recorded'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </details>
            <section aria-labelledby="member-readiness-title" className="mt-5 grid gap-4 lg:grid-cols-2">
              <article className={`rounded-xl border p-5 shadow-sm ${selectedMember.membership_status === 'active' && overdueInstallments.length === 0 ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                <div className="flex items-center gap-2">
                  {selectedMember.membership_status === 'active' && overdueInstallments.length === 0
                    ? <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
                    : <AlertCircle className="size-5 text-amber-700" aria-hidden="true" />}
                  <h3 id="member-readiness-title" className="font-semibold text-slate-900">Loan eligibility review</h3>
                </div>
                <p className={`mt-1 text-sm font-semibold ${!loanDetailsLoading && !loanDetailsError && selectedMember.membership_status === 'active' && overdueInstallments.length === 0 ? 'text-emerald-800' : 'text-amber-900'}`}>
                  {loanDetailsLoading
                    ? 'Checking member records…'
                    : loanDetailsError
                      ? 'Unable to assess'
                      : selectedMember.membership_status !== 'active'
                    ? 'Not clear for application'
                    : overdueInstallments.length
                      ? 'Needs review'
                      : 'No immediate warning flags'}
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
                  <li>{selectedMember.membership_status === 'active' ? '✓ Membership is active' : `• Membership status is ${selectedMember.membership_status}`}</li>
                  {loanDetailsLoading
                    ? <li>Checking loan repayment records…</li>
                    : loanDetailsError
                      ? <li>• Repayment status could not be verified</li>
                      : <li>{overdueInstallments.length === 0 ? '✓ No overdue installments found' : `• ${overdueInstallments.length} overdue installment(s), ${formatMoney(overdueBalance)} outstanding`}</li>}
                  <li className="border-t border-emerald-200/70 pt-2 text-xs leading-5 text-slate-600">Final eligibility is not determined here: minimum savings/capital and membership-tenure rules are not configured in the system.</li>
                </ul>
              </article>
              <article className={`rounded-xl border p-5 shadow-sm ${selectedMember.membership_status === 'suspended' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                <h3 className="font-semibold text-slate-900">Account restrictions</h3>
                {selectedMember.membership_status === 'suspended' ? (
                  <p className="mt-2 text-sm text-red-800">Membership is suspended. Review the member’s status before processing account or loan requests.</p>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">Membership status: <span className="font-medium capitalize">{selectedMember.membership_status}</span>.</p>
                )}
                <p className="mt-2 text-xs text-gray-500">The system does not currently record separate account holds or restriction reasons.</p>
              </article>
              {!loanDetailsLoading && !loanDetailsError && overdueInstallments.length > 0 && (
                <article className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm lg:col-span-2" role="alert">
                  <h3 className="flex items-center gap-2 font-semibold text-red-900">
                    <AlertCircle className="size-4" aria-hidden="true" />
                    Overdue payment alert
                  </h3>
                  <p className="mt-1 text-sm text-red-800">
                    {overdueInstallments.length} missed installment(s) with {formatMoney(overdueBalance)} still due. Review the repayment schedule and contact the member about a payment plan.
                  </p>
                </article>
              )}
            </section>
            <section aria-labelledby="member-loans-title" className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                  {selectedFinancialRecord && (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
                      onClick={() => setSelectedFinancialRecord(null)}
                    >
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="member-record-details-title"
                        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <header className="relative overflow-hidden bg-gradient-to-br from-[#163c34] via-[#1d5145] to-[#276456] px-5 py-5 text-white sm:px-7">
                          <div className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
                          <div className="relative flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Member record</p>
                              <h2 id="member-record-details-title" className="mt-1 text-xl font-bold">{selectedFinancialRecord.title}</h2>
                              <p className="mt-1 text-sm text-emerald-100">{fullName(selectedMember)} · ID {selectedMember.member_number || 'Not assigned'}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedFinancialRecord(null)} aria-label="Close record details" className="flex size-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                              <X className="size-5" aria-hidden="true" />
                            </button>
                          </div>
                        </header>
                        <dl className="grid min-h-0 gap-3 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
                          {selectedFinancialRecord.details.map(([label, value]) => (
                            <div key={label} className={`min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm ${label.includes('notes') || label === 'Description' ? 'sm:col-span-2' : ''}`}>
                              <dt className="text-xs font-medium text-slate-500">{label}</dt>
                              <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value || 'Not recorded'}</dd>
                            </div>
                          ))}
                        </dl>
                        <footer className="flex justify-end border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
                          <button type="button" onClick={() => setSelectedFinancialRecord(null)} className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2">
                            Close
                          </button>
                        </footer>
                      </section>
                    </div>
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
                                  <tr
                                    key={loan.id}
                                    tabIndex={0}
                                    aria-label={`View loan details for ${loan.loan_number || 'loan'}`}
                                    onClick={() => openLoanRecord(loan, nextDue)}
                                    onKeyDown={activateRowFromKeyboard}
                                    className="align-top cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                  >
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
                                              <tr
                                                key={installment.id}
                                                tabIndex={0}
                                                aria-label={`View installment ${installment.installment_number} due ${formatDate(installment.due_date)}`}
                                                onClick={() => openInstallmentRecord(loan, installment, status, remaining)}
                                                onKeyDown={activateRowFromKeyboard}
                                                className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                              >
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
                                            <tr
                                              key={payment.id}
                                              tabIndex={0}
                                              aria-label={`View payment ${payment.payment_number || ''} details`}
                                              onClick={() => openPaymentRecord(loan, payment)}
                                              onKeyDown={activateRowFromKeyboard}
                                              className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                            >
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
            <section aria-labelledby="member-timeline-title" className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="member-timeline-title" className="text-lg font-semibold text-gray-900">Financial timeline and statement</h3>
                  <p className="mt-1 text-sm text-gray-500">Chronological savings activity, loan releases, payments, and recorded member activity.</p>
                </div>
              </div>
              <div className="member-statement-controls mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
                <label className="text-sm font-medium text-gray-700">
                  From
                  <input type="date" value={statementStart} max={statementEnd} onChange={(event) => setStatementStart(event.target.value)} className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  To
                  <input type="date" value={statementEnd} min={statementStart} max={getToday()} onChange={(event) => setStatementEnd(event.target.value)} className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={loanDetailsLoading || Boolean(timelineError) || !statementStart || !statementEnd || statementStart > statementEnd}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer className="size-4" aria-hidden="true" />
                  Print statement
                </button>
                <p className="text-xs text-gray-500">Statement includes {statementRows.length} transaction(s) in the selected period.</p>
              </div>
              {timelineError ? (
                <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{timelineError}</p>
              ) : (
                <div id="member-statement-print" className="amcoms-print-document mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <header className="border-b border-gray-200 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AMCOMS · Member statement</p>
                    <h4 className="mt-1 text-lg font-semibold text-gray-900">{fullName(selectedMember)}</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Member ID: {selectedMember.member_number || 'Not assigned'} · Period: {formatDate(statementStart)} – {formatDate(statementEnd)}
                    </p>
                  </header>
                  {loanDetailsLoading ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">Loading financial activity...</p>
                  ) : statementRows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">No financial activity recorded for this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Activity</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Description</th>
                            <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                            <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {statementRows.map((item) => (
                            <tr
                              key={item.id}
                              tabIndex={0}
                              aria-label={`View ${item.type} details`}
                              onClick={() => openStatementRecord(item)}
                              onKeyDown={activateRowFromKeyboard}
                              className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(item.date)}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{item.type}</td>
                              <td className="max-w-[280px] px-4 py-3 text-gray-600">{item.description || '—'}</td>
                              <td className="max-w-[180px] break-all px-4 py-3 text-gray-600">{item.reference || '—'}</td>
                              <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${item.amount < 0 ? 'text-gray-800' : 'text-gray-900'}`}>
                                {item.amount < 0 ? `−${formatMoney(Math.abs(item.amount))}` : formatMoney(item.amount)}
                                <span className="mt-0.5 block text-xs font-normal text-gray-500">{item.amountLabel}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <footer className="print:hidden border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
                    Generated {formatDate(getToday())}. This statement reflects activity recorded in AMCOMS for the selected period.
                  </footer>
                </div>
              )}
            </section>
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #member-statement-print, #member-statement-print * { visibility: visible !important; }
                html, body, #root { width: 100% !important; min-width: 0 !important; height: auto !important; overflow: visible !important; }
                #member-statement-print {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  max-height: none !important;
                  overflow: visible !important;
                  border: 0 !important;
                  color: #111827 !important;
                }
                #member-statement-print * { min-width: 0 !important; overflow: visible !important; }
                #member-statement-print table { width: 100% !important; min-width: 0 !important; max-width: 100% !important; border-collapse: collapse !important; }
                #member-statement-print th, #member-statement-print td { border: 1px solid #d1d5db !important; }
                #member-statement-print tr { break-inside: avoid; }
              }
            `}</style>
            </div>
            <footer className="flex flex-none justify-end border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
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

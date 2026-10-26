import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Eye, Mail, MapPin, Phone, Search, UserCheck, UserPlus, Users, X } from 'lucide-react';
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

const MemberManagement = () => {
  const [members, setMembers] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">Loading members...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
            <Users className="mx-auto size-10 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-700">No members found</p>
          </div>
        ) : (
          filteredMembers.map((member) => (
            <article key={member.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{fullName(member)}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.membership_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {member.membership_status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Member ID: {member.member_number || 'Not assigned'}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1.5"><Phone className="size-4 text-gray-400" aria-hidden="true" />{member.phone || 'No contact number'}</span>
                    <span className="inline-flex items-center gap-1.5"><Mail className="size-4 text-gray-400" aria-hidden="true" />{member.email || 'No email address'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMember(member)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  View Details
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Address</p>
                  <p className="mt-1 inline-flex text-sm text-gray-800"><MapPin className="mr-1.5 mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />{member.address || 'Not recorded'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Membership date</p>
                  <p className="mt-1 inline-flex items-center text-sm text-gray-800"><CalendarDays className="mr-1.5 size-4 text-gray-400" aria-hidden="true" />{formatDate(member.date_joined)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Membership type</p>
                  <p className="mt-1 text-sm font-medium capitalize text-gray-800">{member.membership_type || 'Not recorded'}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-details-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 id="member-details-title" className="text-xl font-semibold text-gray-900">{fullName(selectedMember)}</h2>
                <p className="mt-1 text-sm text-gray-500">Member ID: {selectedMember.member_number || 'Not assigned'}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close member details">
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2">
              {[
                ['Savings', formatMoney(selectedMember.savings_total)],
                ['Loan balance', formatMoney(selectedMember.loan_balance)],
                ['Time deposits', formatMoney(selectedMember.time_deposit_total)],
                ['Status', selectedMember.membership_status],
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
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="mt-1 text-sm text-gray-900">{value || 'Not recorded'}</dd>
                </div>
              ))}
            </dl>
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

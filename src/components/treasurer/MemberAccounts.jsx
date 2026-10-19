import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const PAGE_SIZE = 50;

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—';

const getMemberName = (member) => [
  member.first_name,
  member.middle_name,
  member.last_name
].filter(Boolean).join(' ');

const MemberAccounts = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [members, setMembers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadMembers = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      let query = supabase.from('members').select(`
        id, member_number, first_name, middle_name, last_name, membership_status,
        savings_accounts(id, account_number, account_type, balance, interest_rate, status, opening_date, closing_date),
        loans(id, loan_number, principal_amount, balance, status, maturity_date, release_date)
      `, { count: 'exact' });
      const term = searchTerm.trim().replace(/[,%()_*]/g, '');

      if (term) {
        const escaped = term.replaceAll('.', '\\.');
        query = query.or(
          `first_name.ilike.%${escaped}%,middle_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,member_number.ilike.%${escaped}%`
        );
      }

      const { data, count, error: queryError } = await query
        .order('last_name', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (queryError) throw queryError;

      if (currentRequest !== requestId.current) return;
      setMembers(data || []);
      setTotalCount(count || 0);
      setError('');
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load treasurer member accounts:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'member accounts'));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, searchTerm]);

  useEffect(() => {
    loadMembers();
    return () => {
      requestId.current += 1;
    };
  }, [loadMembers]);

  useMultipleRealtimeSubscriptions([
    'members', 'savings_accounts', 'loans', 'savings_transactions', 'loan_payments'
  ].map((table) => ({ table, onUpdate: loadMembers })), [loadMembers]);

  const handleSearch = (event) => {
    setLoading(true);
    setPage(0);
    setSearchTerm(event.target.value);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Member Accounts</h2>
          <p className="mt-1 text-sm text-gray-500">Live savings, time deposit, and active loan balances by member.</p>
        </div>
        <label className="relative mt-5 block max-w-xl">
          <span className="sr-only">Search members</span>
          <Search size={18} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={handleSearch}
            placeholder="Search by member name or number"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </label>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Members matching search</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : totalCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Members on this page</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : members.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Page</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{loading ? '…' : `${page + 1} of ${totalPages}`}</p>
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500 shadow-sm">
            Loading member accounts…
          </div>
        ) : !error && members.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500 shadow-sm">
            {searchTerm ? 'No members match this search.' : 'No member records found.'}
          </div>
        ) : !error ? members.map((member) => {
          const accounts = member.savings_accounts || [];
          const activeAccounts = accounts.filter((account) => account.status === 'active');
          const savingsBalance = activeAccounts
            .filter((account) => account.account_type !== 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0);
          const timeDepositBalance = activeAccounts
            .filter((account) => account.account_type === 'time_deposit')
            .reduce((total, account) => total + Number(account.balance || 0), 0);
          const activeLoans = (member.loans || []).filter((loan) => loan.status === 'active');
          const loanBalance = activeLoans.reduce((total, loan) => total + Number(loan.balance || 0), 0);
          const expanded = expandedMemberId === member.id;

          return (
            <article key={member.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(140px,1fr))_auto] lg:items-center">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">{getMemberName(member)}</h3>
                  <p className="mt-1 text-sm text-gray-500">Member no. {member.member_number}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    member.membership_status === 'active'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {member.membership_status || 'Unknown status'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Savings</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(savingsBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeAccounts.filter((account) => account.account_type !== 'time_deposit').length} active accounts</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Time deposits</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(timeDepositBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeAccounts.filter((account) => account.account_type === 'time_deposit').length} active accounts</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active loans</p>
                  <p className="mt-1 font-semibold tabular-nums text-gray-900">{formatMoney(loanBalance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{activeLoans.length} active loans</p>
                </div>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedMemberId(expanded ? null : member.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {expanded ? 'Hide details' : 'View details'}
                  {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                </button>
              </div>

              {expanded && (
                <div className="grid grid-cols-1 gap-6 border-t border-gray-200 bg-gray-50 p-5 xl:grid-cols-2">
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">Savings and time deposit accounts</h4>
                    {accounts.length === 0 ? (
                      <p className="text-sm text-gray-500">No savings accounts recorded.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                            <tr>
                              <th className="px-3 py-2">Account</th>
                              <th className="px-3 py-2">Type</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {accounts.map((account) => (
                              <tr key={account.id}>
                                <td className="px-3 py-2 font-mono text-xs text-gray-700">{account.account_number}</td>
                                <td className="px-3 py-2 capitalize text-gray-700">{account.account_type.replaceAll('_', ' ')}</td>
                                <td className="px-3 py-2 capitalize text-gray-600">{account.status}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{formatMoney(account.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">Loan accounts</h4>
                    {member.loans?.length ? (
                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                            <tr>
                              <th className="px-3 py-2">Loan</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Maturity</th>
                              <th className="px-3 py-2 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {member.loans.map((loan) => (
                              <tr key={loan.id}>
                                <td className="px-3 py-2 font-mono text-xs text-gray-700">{loan.loan_number}</td>
                                <td className="px-3 py-2 capitalize text-gray-600">{loan.status}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(loan.maturity_date)}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{formatMoney(loan.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No loan records found.</p>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        }) : null}
      </section>

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <p className="text-sm text-gray-500">
          {totalCount ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}` : 'No results'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => Math.max(0, current - 1));
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => current + 1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberAccounts;

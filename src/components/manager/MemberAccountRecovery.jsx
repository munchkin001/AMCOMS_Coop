import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAppUrl } from '../../lib/appUrl';

const MemberAccountRecovery = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadMembers = useCallback(async () => {
    setError('');
    try {
      const { data: memberRows, error: memberError } = await supabase
        .from('members')
        .select('id, member_number, first_name, middle_name, last_name, email, membership_status, archived_at')
        .eq('membership_status', 'active')
        .is('archived_at', null)
        .order('last_name', { ascending: true });
      if (memberError) throw memberError;

      const memberIds = (memberRows || []).map((member) => member.id);
      let accounts = new Map();
      if (memberIds.length) {
        const { data, error: statusError } = await supabase.rpc('bookkeeper_member_account_status', {
          p_member_ids: memberIds
        });
        if (statusError) throw statusError;
        accounts = new Map((data || []).map((account) => [account.member_id, account]));
      }

      setMembers((memberRows || []).map((member) => ({
        ...member,
        full_name: [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' '),
        portal_account: accounts.get(member.id) || null
      })));
    } catch (loadError) {
      console.error('Unable to load member recovery list:', loadError);
      setError('Member accounts could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => !query || [member.member_number, member.full_name, member.email]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [members, search]);

  const getAccountStatus = (member) => {
    if (!member.portal_account?.has_account) return 'No portal account';
    if (!member.portal_account.is_active) return 'Disabled';
    return member.portal_account.must_change_password ? 'Setup/reset required' : 'Active';
  };

  const requestReset = async () => {
    if (!selectedMember) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data, error: resetError } = await supabase.functions.invoke('member-account', {
        body: { action: 'reset', member_id: selectedMember.id, app_url: getAppUrl() }
      });
      if (resetError) {
        let message;
        try {
          message = (await resetError.context?.clone?.().json())?.error;
        } catch {
          message = null;
        }
        throw new Error(message || 'Password reset could not be initiated.');
      }
      setNotice(data?.message || 'Password reset instructions have been sent to the member’s registered email.');
      setSelectedMember(null);
      await loadMembers();
    } catch (resetError) {
      setError(resetError.message || 'Password reset could not be initiated.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-950">Member Account Recovery</h1>
      </header>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        If a member cannot access this email, do not set a password or send a reset elsewhere. Verify identity under cooperative procedure and complete a separately verified email-change process first. AMCOMS has no approved alternate-email recovery workflow yet.
      </p>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
        <Search size={18} aria-hidden="true" className="shrink-0 text-gray-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member name, ID, or email" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none focus:ring-0" />
      </label>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Member</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Registered email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Account status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading member accounts…</td></tr> : filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{member.full_name}</p><p className="text-xs text-gray-500">{member.member_number}</p></td>
                  <td className="px-4 py-3 text-sm text-gray-700">{member.email || 'No email registered'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{getAccountStatus(member)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { setSelectedMember(member); setError(''); }} disabled={!member.email || !member.portal_account?.has_account || !member.portal_account?.is_active} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <KeyRound size={16} aria-hidden="true" /> Initiate Password Reset
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredMembers.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No active members match this search.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="manager-reset-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id="manager-reset-title" className="text-lg font-semibold text-gray-900">Password Reset</h2>
              <p className="mt-1 text-sm text-gray-600">{selectedMember.full_name} · {selectedMember.member_number}</p>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-gray-700">Send password reset instructions to this member’s registered email?</p>
              <p className="text-sm text-gray-600">The member will create a new password using a secure, single-use Supabase recovery link.</p>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setSelectedMember(null)} disabled={sending} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={requestReset} disabled={sending} className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{sending ? 'Sending…' : 'Send Reset Instructions'}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default MemberAccountRecovery;

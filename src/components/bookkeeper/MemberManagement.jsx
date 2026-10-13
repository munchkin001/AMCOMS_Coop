import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Eye, KeyRound, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';
import { getAppUrl } from '../../lib/appUrl';

const emptyForm = {
  first_name: '', middle_name: '', last_name: '', email: '', phone: '', address: '',
  date_of_birth: '', gender: '', membership_type: 'regular', date_joined: new Date().toISOString().slice(0, 10),
  shares_owned: '0', total_capital: '0', emergency_contact_name: '', emergency_contact_phone: '',
  family_members: '[]', rsbsa: '', tin: '', ncfrs: '', occupation: '',
  barangay: '', municipality: '', province: ''
};

const money = (value) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fullName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');
const memberNameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const compareMembersByName = (left, right) =>
  memberNameCollator.compare(left.last_name || '', right.last_name || '') ||
  memberNameCollator.compare(left.first_name || '', right.first_name || '') ||
  memberNameCollator.compare(left.middle_name || '', right.middle_name || '') ||
  memberNameCollator.compare(left.member_number || '', right.member_number || '');
const parseFamilyMembers = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Family member details must be a list.');
  return parsed;
};
const isArchived = (member) => Boolean(member.archived_at) || member.membership_status === 'inactive';
const accountStatus = (member) => {
  if (isArchived(member) || member.portal_account?.is_active === false) return 'Disabled';
  if (!member.portal_account?.has_account) return 'Not created';
  return member.portal_account.must_change_password ? 'Not activated' : 'Activated';
};
const getAccountAction = (member) => {
  if (member.portal_account?.is_active === false) return 'reactivate-member';
  if (!member.portal_account?.has_account) return 'invite';
  return 'reset';
};
const getAccountActionError = async (error) => {
  try {
    const response = error?.context?.clone?.();
    const payload = response ? await response.json() : null;
    if (typeof payload?.error === 'string') return payload.error;
    if (typeof payload?.message === 'string') return payload.message;
  } catch {
    // Fall back to the Supabase Functions error when the response is not JSON.
  }
  if (typeof error?.message === 'string' && error.message !== 'Edge Function returned a non-2xx status code') {
    return error.message;
  }
  return error?.message || 'The member account action could not be completed.';
};

const MemberManagement = ({ canManageMembers = true }) => {
  const [members, setMembers] = useState([]);
  const [archivedMembers, setArchivedMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState('all');
  const [modal, setModal] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createPortalAccount, setCreatePortalAccount] = useState(true);
  const [accountActionMemberId, setAccountActionMemberId] = useState(null);
  const [portalNotice, setPortalNotice] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [confirmPossibleDuplicate, setConfirmPossibleDuplicate] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveReview, setArchiveReview] = useState(null);
  const [archiveReviewLoading, setArchiveReviewLoading] = useState(false);
  const [deleteConfirmMember, setDeleteConfirmMember] = useState(null);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    setError('');
    try {
      const [activeResult, archiveResult] = await Promise.all([
        supabase
          .from('members')
          .select('id, member_number, first_name, middle_name, last_name, email, phone, address, date_of_birth, gender, membership_type, membership_status, date_joined, shares_owned, total_capital, emergency_contact_name, emergency_contact_phone, family_members, rsbsa, tin, ncfrs, occupation, barangay, municipality, province')
          .in('membership_status', ['active', 'suspended'])
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })
          .order('middle_name', { ascending: true }),
        supabase
          .from('archived_members')
          .select('id, member_id, member_snapshot, member_number, first_name, middle_name, last_name, email, phone, address, date_joined, previous_status, archived_at, archived_by, archive_reason')
          .order('archived_at', { ascending: false })
      ]);
      if (activeResult.error) throw activeResult.error;
      if (archiveResult.error) throw archiveResult.error;

      const memberIds = [...new Set([
        ...(activeResult.data || []).map((member) => member.id),
        ...(archiveResult.data || []).map((archive) => archive.member_id)
      ])];
      let portalAccounts = new Map();
      let savingsAccounts = new Map();
      if (memberIds.length) {
        const [portalResult, savingsResult] = await Promise.all([
          supabase.rpc('bookkeeper_member_account_status', { p_member_ids: memberIds }),
          supabase
            .from('savings_accounts')
            .select('member_id, account_number')
            .in('member_id', memberIds)
            .eq('status', 'active')
            .order('account_number', { ascending: true })
        ]);
        const { data: accountRows, error: accountError } = portalResult;
        if (accountError) throw accountError;
        if (savingsResult.error) throw savingsResult.error;
        portalAccounts = new Map((accountRows || []).map((account) => [account.member_id, account]));
        savingsAccounts = (savingsResult.data || []).reduce((accounts, account) => {
          const memberAccounts = accounts.get(account.member_id) || [];
          memberAccounts.push(account.account_number);
          accounts.set(account.member_id, memberAccounts);
          return accounts;
        }, new Map());
      }

      const archivedByIds = [...new Set((archiveResult.data || []).map((archive) => archive.archived_by).filter(Boolean))];
      let staffNames = new Map();
      if (archivedByIds.length) {
        const { data: staffRows, error: staffError } = await supabase
          .from('staff')
          .select('id, full_name')
          .in('id', archivedByIds);
        if (staffError) throw staffError;
        staffNames = new Map((staffRows || []).map((row) => [row.id, row.full_name]));
      }
      setMembers((activeResult.data || []).map((member) => ({
        ...member,
        portal_account: portalAccounts.get(member.id) || null,
        savings_account_numbers: savingsAccounts.get(member.id) || []
      })));
      setArchivedMembers((archiveResult.data || []).map((archive) => ({
        ...archive.member_snapshot,
        id: archive.member_id,
        member_number: archive.member_number || archive.member_snapshot?.member_number,
        first_name: archive.first_name || archive.member_snapshot?.first_name,
        middle_name: archive.middle_name || archive.member_snapshot?.middle_name,
        last_name: archive.last_name || archive.member_snapshot?.last_name,
        email: archive.email || archive.member_snapshot?.email,
        phone: archive.phone || archive.member_snapshot?.phone,
        address: archive.address || archive.member_snapshot?.address,
        date_joined: archive.date_joined || archive.member_snapshot?.date_joined,
        previous_status: archive.previous_status,
        archive_record_id: archive.id,
        archived_at: archive.archived_at,
        archived_by: archive.archived_by,
        archived_by_name: staffNames.get(archive.archived_by) || '',
        archive_reason: archive.archive_reason,
        portal_account: portalAccounts.get(archive.member_id) || null,
        savings_account_numbers: savingsAccounts.get(archive.member_id) || []
      })));
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

  const activeMembers = members;
  const filteredMembers = useMemo(() => {
    const source = view === 'archived' ? archivedMembers : activeMembers;
    const normalizedSearch = search.trim().toLowerCase();
    return source.filter((member) => {
      const matchesSearch = !normalizedSearch || [
        member.member_number, fullName(member), member.phone, member.address, member.email
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === 'all' || member.membership_status === statusFilter;
      const matchesType = view === 'all' || view === 'archived' || member.membership_type === view;
      return matchesSearch && matchesStatus && matchesType;
    }).sort(compareMembersByName);
  }, [activeMembers, archivedMembers, search, statusFilter, view]);

  const startAdd = () => {
    if (!canManageMembers) return;
    setForm(emptyForm);
    setSelectedMember(null);
    setDuplicateMatches([]);
    setConfirmPossibleDuplicate(false);
    setError('');
    setPortalNotice('');
    setCreatePortalAccount(true);
    setModal('add');
  };

  const startEdit = (member) => {
    if (!canManageMembers) return;
    setSelectedMember(member);
    setForm({
      ...emptyForm,
      ...member,
      username: member.portal_account?.username || '',
      date_of_birth: member.date_of_birth || '',
      date_joined: member.date_joined || ''
    });
    setDuplicateMatches([]);
    setConfirmPossibleDuplicate(false);
    setError('');
    setPortalNotice('');
    setModal('edit');
  };

  const sendMemberAccountLink = async (member, requestedAction) => {
    if (!canManageMembers) return;
    const action = requestedAction || getAccountAction(member);
    setError('');
    setPortalNotice('');
    setAccountActionMemberId(member.id);
    try {
      const { data, error: actionError } = await supabase.functions.invoke('member-account', {
        body: { action, member_id: member.id, app_url: getAppUrl() }
      });
      if (actionError) throw actionError;
      setPortalNotice(data?.temporary_password
        ? `Username: ${data.username}\nTemporary password: ${data.temporary_password}\nGive these credentials to the member securely. They must change the password after signing in.`
        : action === 'reset'
        ? 'The temporary password was generated. Share it securely with the member; they must change it after signing in.'
        : action === 'reactivate-member'
        ? (data?.portal_access_restored ? `${member.member_number} is active again, and Member Portal access was restored.` : `${member.member_number} is active again. No Member Portal account is linked.`)
        : data?.message || 'The member account action was completed.');
      await loadMembers();
    } catch (actionError) {
      await loadMembers();
      setError(await getAccountActionError(actionError));
    } finally {
      setAccountActionMemberId(null);
    }
  };

  const handleMemberAccountAction = (member) => {
    if (!canManageMembers) return;
    if (getAccountAction(member) === 'reset') {
      setSelectedMember(member);
      setError('');
      setModal('password-reset');
      return;
    }
    sendMemberAccountLink(member);
  };

  const confirmPasswordReset = async () => {
    if (!canManageMembers) return;
    if (!selectedMember) return;
    setModal('');
    await sendMemberAccountLink(selectedMember, 'reset');
  };

  const startArchive = async (member) => {
    if (!canManageMembers) return;
    setSelectedMember(member);
    setArchiveReason('');
    setArchiveReview(null);
    setError('');
    setModal('archive');
    setArchiveReviewLoading(true);
    const { data, error: reviewError } = await supabase.rpc('get_member_archive_review', { p_member_id: member.id });
    setArchiveReviewLoading(false);
    if (reviewError) {
      setError(reviewError.message || 'Financial clearance could not be checked.');
      return;
    }
    setArchiveReview(data);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!canManageMembers) return;
    setSaving(true);
    setError('');
    setPortalNotice('');
    try {
      if (modal === 'add') {
        const memberPayload = {
          ...form,
          shares_owned: form.shares_owned || '0',
          total_capital: form.total_capital || '0',
          family_members: parseFamilyMembers(form.family_members)
        };
        const { data, error: createError } = await supabase.rpc('bookkeeper_create_member', {
          p_member: memberPayload,
          p_confirm_possible_duplicate: confirmPossibleDuplicate
        });
        if (createError) throw createError;
        if (data?.possible_duplicate) {
          setDuplicateMatches(data.matches || []);
          if (data.email_conflict) {
            setConfirmPossibleDuplicate(false);
            setError('An existing member already uses this email. Review the match and use a unique email address.');
          }
          setSaving(false);
          return;
        }
        setModal('');
        await loadMembers();
        if (createPortalAccount && data?.id) {
          const { data: accountData, error: accountError } = await supabase.functions.invoke('member-account', {
            body: {
              action: 'invite',
              member_id: data.id,
              app_url: getAppUrl()
            }
          });
          setPortalNotice(accountError
            ? `Member ${data.member_number} was created, but the portal account could not be created. Use the account action to retry.`
            : accountData?.temporary_password
            ? `Username: ${accountData.username}\nTemporary password: ${accountData.temporary_password}\nGive these credentials to the member securely. They must change the password after signing in.`
            : accountData?.message || 'Member created and activation instructions sent.');
          await loadMembers();
        }
      } else {
        const editableFields = {
          first_name: form.first_name,
          middle_name: form.middle_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          date_of_birth: form.date_of_birth,
          gender: form.gender,
          membership_type: form.membership_type,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          family_members: parseFamilyMembers(form.family_members),
          rsbsa: form.rsbsa,
          tin: form.tin,
          ncfrs: form.ncfrs,
          occupation: form.occupation,
          barangay: form.barangay,
          municipality: form.municipality,
          province: form.province
        };
        const { error: updateError } = await supabase.rpc('bookkeeper_update_member', {
          p_member_id: selectedMember.id,
          p_member: editableFields
        });
        if (updateError) throw updateError;
        const username = form.username.trim().toLowerCase();
        if (selectedMember.portal_account?.has_account && username !== (selectedMember.portal_account.username || '')) {
          const { error: usernameError } = await supabase.rpc('bookkeeper_update_member_username', {
            p_member_id: selectedMember.id,
            p_username: username
          });
          if (usernameError) throw new Error(`Member details were saved, but the username was not updated: ${usernameError.message}`);
        }
      }
      if (modal === 'edit') {
        setModal('');
        await loadMembers();
      }
    } catch (saveError) {
      console.error('Unable to save member:', saveError);
      setError(saveError.message || 'The member record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (event) => {
    event.preventDefault();
    if (!canManageMembers) return;
    if (!archiveReason.trim() || !selectedMember) return;
    setSaving(true);
    setError('');
    const { error: archiveError } = await supabase.rpc('bookkeeper_archive_member', {
      p_member_id: selectedMember.id,
      p_reason: archiveReason.trim()
    });
    setSaving(false);
    if (archiveError) {
      setError(archiveError.message || 'The member could not be archived.');
      return;
    }
    const { error: authDisableError } = await supabase.functions.invoke('member-account', {
      body: { action: 'disable-account', member_id: selectedMember.id }
    });
    if (authDisableError) {
      setPortalNotice('Member archived and AMCOMS access disabled. Supabase sign-in disablement could not be confirmed; contact the administrator.');
    }
    setModal('');
    await loadMembers();
  };

  const handleReactivate = async (event) => {
    event.preventDefault();
    if (!canManageMembers) return;
    if (!selectedMember) return;
    setSaving(true);
    setError('');
    setPortalNotice('');
    try {
      const { data, error: restoreError } = await supabase.functions.invoke('member-account', {
        body: { action: 'reactivate-member', member_id: selectedMember.id }
      });
      if (restoreError) throw restoreError;
      setPortalNotice(data?.portal_access_restored
        ? `${data.member_number} is active again, and Member Portal access was restored.`
        : `${data?.member_number || selectedMember.member_number} is active again. No Member Portal account is linked.`);
      setModal('');
      await loadMembers();
    } catch (restoreError) {
      setError(await getAccountActionError(restoreError));
      await loadMembers();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!canManageMembers || !deleteConfirmMember) return;
    setDeleteAccountLoading(true);
    setError('');
    setPortalNotice('');
    try {
      const { data, error: deleteError } = await supabase.functions.invoke('member-account', {
        body: { action: 'delete-account', member_id: deleteConfirmMember.id }
      });
      if (deleteError) throw deleteError;
      setPortalNotice(`Portal account for ${deleteConfirmMember.member_number} has been permanently deleted.`);
      setDeleteConfirmMember(null);
      await loadMembers();
    } catch (deleteError) {
      setError(await getAccountActionError(deleteError));
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';
  const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';
  const memberViews = [
    { id: 'all', label: 'All Members', count: activeMembers.length },
    { id: 'regular', label: 'Regular Members', count: activeMembers.filter((member) => member.membership_type === 'regular').length },
    { id: 'associate', label: 'Associate Members', count: activeMembers.filter((member) => member.membership_type === 'associate').length },
    { id: 'archived', label: 'Archived Members', count: archivedMembers.length }
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Members</h1>
          <p className="mt-1 text-sm text-gray-600">{canManageMembers ? 'View and maintain cooperative member records.' : 'View cooperative member records and account details.'}</p>
        </div>
        {canManageMembers && (
          <button type="button" onClick={startAdd} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus size={18} aria-hidden="true" />Add Member
          </button>
        )}
      </header>

      <div className="flex flex-col gap-3 border-b border-gray-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-5 overflow-x-auto" aria-label="Member type">
          {memberViews.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => { setView(id); setStatusFilter('all'); }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${view === id ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {label} <span className="ml-1 text-xs">{count}</span>
            </button>
          ))}
        </div>
        {view !== 'archived' && (
          <label className="flex items-center gap-2 pb-2 text-sm text-gray-600 sm:pb-0">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="all">All active statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <Search size={18} className="shrink-0 text-gray-400" aria-hidden="true" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, member ID, contact, or email" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none focus:ring-0" />
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {portalNotice && <p role="status" className="whitespace-pre-line rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{portalNotice}</p>}
      {loading ? <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading members...</div> : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Membership Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Savings account no.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Membership Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Account</th>
                  {view === 'archived' && <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Archived</th>}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">{canManageMembers ? 'Actions' : 'Details'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="align-top hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{fullName(member)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{member.member_number}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{member.portal_account?.username || '—'}</td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-700">{member.membership_type || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{member.savings_account_numbers?.length ? member.savings_account_numbers.join(', ') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{member.phone || '—'}<br /><span className="text-xs text-gray-500">{member.email || 'No email'}</span></td>
                    <td className="max-w-xs px-4 py-3 text-sm text-gray-700">{member.address || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{member.date_joined || '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${isArchived(member) ? 'bg-gray-100 text-gray-700' : member.membership_status === 'suspended' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{isArchived(member) ? 'Archived' : member.membership_status}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-700">{accountStatus(member)}</td>
                    {view === 'archived' && <td className="px-4 py-3 text-xs text-gray-600">{member.archived_at ? new Date(member.archived_at).toLocaleDateString() : 'Inactive'}<br />{member.archived_by_name || (member.archived_by ? 'Staff' : '')}<br />{member.archive_reason || ''}</td>}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => { setSelectedMember(member); setModal('view'); }} aria-label={`View ${fullName(member)}`} title="View" className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-blue-700"><Eye size={17} /></button>
                        {view !== 'archived' && canManageMembers && <>
                          <button type="button" onClick={() => startEdit(member)} aria-label={`Edit ${fullName(member)}`} title="Edit" className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-blue-700"><Pencil size={17} /></button>
                          {member.membership_status === 'active' && <button type="button" onClick={() => handleMemberAccountAction(member)} disabled={accountActionMemberId === member.id} aria-label={`${getAccountAction(member) === 'reactivate-member' ? 'Restore portal access for' : getAccountAction(member) === 'resend-activation' ? 'Resend activation for' : getAccountAction(member) === 'reset' ? 'Generate a temporary password for' : 'Create portal account for'} ${fullName(member)}`} title={getAccountAction(member) === 'reactivate-member' ? 'Restore portal access' : getAccountAction(member) === 'resend-activation' ? 'Resend activation' : getAccountAction(member) === 'reset' ? 'Generate temporary password' : 'Create portal account'} className="rounded-md p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">{accountActionMemberId === member.id ? <KeyRound size={17} className="animate-pulse" /> : getAccountAction(member) === 'reactivate-member' ? <RotateCcw size={17} /> : <KeyRound size={17} />}</button>}
                          {member.membership_status === 'active' && <button type="button" onClick={() => startArchive(member)} aria-label={`Archive ${fullName(member)}`} title="Archive member" className="rounded-md p-2 text-gray-600 hover:bg-amber-50 hover:text-amber-800"><Archive size={17} /></button>}
                        </>}
                        {view === 'archived' && canManageMembers && (
                          <>
                            <button type="button" onClick={() => { setSelectedMember(member); setError(''); setModal('reactivate'); }} aria-label={`Reactivate ${fullName(member)}`} title="Reactivate member" className="rounded-md p-2 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"><RotateCcw size={17} /></button>
                            {member.portal_account?.has_account && (
                              <button type="button" onClick={() => { setDeleteConfirmMember(member); setError(''); }} aria-label={`Delete portal account for ${fullName(member)}`} title="Delete portal account" className="rounded-md p-2 text-gray-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && <tr><td colSpan={view === 'archived' ? 11 : 10} className="px-4 py-12 text-center text-sm text-gray-500">No {memberViews.find(({ id }) => id === view)?.label.toLowerCase()} match this search.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-form-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div><h2 id="member-form-title" className="text-lg font-semibold text-gray-900">Add Member</h2><p className="text-xs text-gray-500">Member number is generated when saved.</p></div>
              <button type="button" onClick={() => setModal('')} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ['first_name', 'First name', true], ['middle_name', 'Middle name', false], ['last_name', 'Last name', true],
                  ['date_of_birth', 'Date of birth', false, 'date'], ['email', 'Email', false, 'email'], ['phone', 'Contact number', false, 'tel'],
                  ['date_joined', 'Membership date', true, 'date'], ['gender', 'Gender', false, 'select'],
                  ['shares_owned', 'Shares owned', false, 'number'], ['total_capital', 'Share capital', false, 'number'], ['occupation', 'Occupation', false],
                  ['barangay', 'Barangay', false], ['municipality', 'Municipality / city', false], ['province', 'Province', false],
                  ['emergency_contact_name', 'Emergency contact name', false], ['emergency_contact_phone', 'Emergency contact phone', false],
                  ['rsbsa', 'RSBSA', false], ['tin', 'TIN', false], ['ncfrs', 'NCFRS', false]
                ].map(([name, label, required, type = 'text']) => (
                  <label key={name} className={labelClass}>{label}{required && ' *'}
                    {type === 'select' ? <select name={name} value={form[name]} onChange={updateField} required={required} className={`${inputClass} mt-1`}>
                      <option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                    </select> : <input name={name} type={type} pattern={name === 'email' ? '[^@ ]+@[^@ ]+[.][^@ ]+' : undefined} title={name === 'email' ? 'Enter a valid email containing @, or leave this field blank.' : undefined} min={type === 'number' ? '0' : undefined} step={name === 'total_capital' ? '0.01' : undefined} value={form[name]} onChange={updateField} required={required} className={`${inputClass} mt-1`} />}
                  </label>
                ))}
                <label className={labelClass}>Member type *
                  <select name="membership_type" value={form.membership_type} onChange={updateField} required className={`${inputClass} mt-1`}>
                    <option value="regular">Regular</option>
                    <option value="associate">Associate</option>
                  </select>
                </label>
                <label className={`${labelClass} sm:col-span-3`}>Address *
                  <textarea name="address" value={form.address} onChange={updateField} required rows={2} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                <input type="checkbox" checked={createPortalAccount} onChange={(event) => setCreatePortalAccount(event.target.checked)} className="mt-0.5 accent-blue-700" />
                <span><span className="block font-medium">Create Member Portal account</span><span className="mt-0.5 block text-xs text-blue-800">The username defaults to the member number. A unique temporary password is generated and shown here; it is never emailed. The member must change the password on first sign-in. If no email is recorded, staff must handle password recovery.</span></span>
              </label>
              {duplicateMatches.length > 0 && (
                <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-950">Possible existing member found. Please verify before creating a new member.</p>
                  {duplicateMatches.map((match) => <p key={match.id} className="text-sm text-amber-900">{match.member_number} · {[match.first_name, match.middle_name, match.last_name].filter(Boolean).join(' ')} · {match.phone || 'No phone'} · DOB {match.date_of_birth || '—'}</p>)}
                  <label className="flex items-center gap-2 text-sm text-amber-950"><input type="checkbox" checked={confirmPossibleDuplicate} onChange={(event) => setConfirmPossibleDuplicate(event.target.checked)} /> I reviewed these matches and confirm this is a different member.</label>
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setModal('')} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700">Cancel</button>
                <button type="submit" disabled={saving || (duplicateMatches.length > 0 && !confirmPossibleDuplicate)} className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : duplicateMatches.length > 0 ? 'Confirm and Add Member' : 'Add Member'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === 'edit' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-edit-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div><h2 id="member-edit-title" className="text-lg font-semibold text-gray-900">Edit Member</h2><p className="text-xs text-gray-500">{selectedMember.member_number} · Financial history is not editable here.</p></div>
              <button type="button" onClick={() => setModal('')} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className={labelClass}>Username
                  <input
                    name="username"
                    type="text"
                    autoComplete="username"
                    pattern="[a-zA-Z0-9._-]{3,30}"
                    title="Use 3-30 letters, numbers, dots, underscores, or hyphens."
                    value={form.username || ''}
                    onChange={updateField}
                    disabled={!selectedMember.portal_account?.has_account}
                    className={`${inputClass} mt-1 disabled:bg-gray-100`}
                  />
                  {!selectedMember.portal_account?.has_account && <span className="mt-1 block text-xs text-gray-500">Create a Member Portal account before setting its username.</span>}
                </label>
                <label className={labelClass}>Member type *
                  <select name="membership_type" value={form.membership_type || 'regular'} onChange={updateField} required className={`${inputClass} mt-1`}>
                    <option value="regular">Regular</option>
                    <option value="associate">Associate</option>
                  </select>
                </label>
                {['first_name', 'middle_name', 'last_name', 'date_of_birth', 'email', 'phone', 'occupation', 'barangay', 'municipality', 'province', 'emergency_contact_name', 'emergency_contact_phone', 'rsbsa', 'tin', 'ncfrs'].map((name) => (
                  <label key={name} className={labelClass}>{name.replaceAll('_', ' ')}
                    <input name={name} type={name === 'date_of_birth' ? 'date' : name === 'email' ? 'email' : name === 'emergency_contact_phone' || name === 'phone' ? 'tel' : 'text'} value={form[name] || ''} onChange={updateField} className={`${inputClass} mt-1`} />
                  </label>
                ))}
                <label className={`${labelClass} sm:col-span-3`}>Address
                  <textarea name="address" value={form.address || ''} onChange={updateField} rows={2} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setModal('')} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700">Cancel</button>
                <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === 'view' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-view-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4"><div><h2 id="member-view-title" className="text-lg font-semibold text-gray-900">{fullName(selectedMember)}</h2><p className="text-xs text-gray-500">{selectedMember.member_number}</p></div><button type="button" onClick={() => setModal('')} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {Object.entries({ 'Membership type': selectedMember.membership_type, Email: selectedMember.email, Contact: selectedMember.phone, Address: selectedMember.address, 'Date of birth': selectedMember.date_of_birth, 'Membership date': selectedMember.date_joined, Status: isArchived(selectedMember) ? 'Archived' : selectedMember.membership_status, 'Share capital': money(selectedMember.total_capital), 'Shares owned': selectedMember.shares_owned, 'Emergency contact': selectedMember.emergency_contact_name, 'Emergency phone': selectedMember.emergency_contact_phone }).map(([label, value]) => <div key={label}><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className="mt-1 text-sm capitalize text-gray-900">{value || '—'}</p></div>)}
              {isArchived(selectedMember) && <div className="sm:col-span-2"><p className="text-xs font-medium uppercase text-gray-500">Archive details</p><p className="mt-1 text-sm text-gray-900">{selectedMember.archive_reason || 'No reason recorded'} · {selectedMember.archived_at ? new Date(selectedMember.archived_at).toLocaleString() : 'Archived as inactive'}</p></div>}
            </div>
          </section>
        </div>
      )}

      {modal === 'password-reset' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="password-reset-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id="password-reset-title" className="text-lg font-semibold text-gray-900">Password Reset</h2>
              <p className="mt-1 text-sm text-gray-600">{fullName(selectedMember)} · {selectedMember.member_number}</p>
            </div>
            <div className="space-y-4 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <p className="text-sm text-gray-700">Generate a new temporary password? It will be shown here for the bookkeeper to deliver securely and will not be emailed. The current password will stop working, and the member must change the password after signing in.{!selectedMember.email && ' Staff must handle password recovery until an email address is added.'}</p>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setModal('')} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700">Cancel</button>
                <button type="button" onClick={confirmPasswordReset} className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">Generate Temporary Password</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal === 'archive' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="archive-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4"><h2 id="archive-title" className="text-lg font-semibold text-gray-900">Member Exit Review</h2><p className="mt-1 text-sm text-gray-600">{fullName(selectedMember)} · {selectedMember.member_number}</p></div>
            <div className="space-y-4 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              {archiveReviewLoading ? <p className="text-sm text-gray-500">Checking financial records...</p> : archiveReview && <>
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-gray-500">Savings</dt><dd className="mt-1 font-semibold">{money(archiveReview.savings_balance)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Time deposit</dt><dd className="mt-1 font-semibold">{money(archiveReview.time_deposit_balance)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Outstanding loans</dt><dd className="mt-1 font-semibold">{money(archiveReview.outstanding_loan_balance)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Loans with balance</dt><dd className="mt-1 font-semibold">{archiveReview.outstanding_loan_count}</dd></div>
                  <div><dt className="text-xs text-gray-500">Pending loans</dt><dd className="mt-1 font-semibold">{archiveReview.pending_loan_count}</dd></div>
                  <div><dt className="text-xs text-gray-500">Unresolved requests</dt><dd className="mt-1 font-semibold">{archiveReview.unresolved_request_count}</dd></div>
                  <div><dt className="text-xs text-gray-500">Share capital</dt><dd className="mt-1 font-semibold">{money(archiveReview.member.total_capital)}</dd></div>
                </dl>
                {(Number(archiveReview.savings_balance) > 0 || Number(archiveReview.time_deposit_balance) > 0 || Number(archiveReview.member.total_capital) > 0) && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Balances and share capital will be preserved unchanged. Follow the cooperative’s separate settlement process; archiving will not withdraw or modify funds.</p>}
                {!archiveReview.cleared && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This member has an outstanding financial obligation or unresolved request. Resolve it before archiving.</p>}
                <label className={labelClass}>Archive reason *<textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required maxLength={500} rows={3} placeholder="e.g. Member voluntarily withdrew membership" className={`${inputClass} mt-1`} /></label>
              </>}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4"><button type="button" onClick={() => setModal('')} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700">Cancel</button><button type="button" disabled={saving || archiveReviewLoading || !archiveReview?.cleared || !archiveReason.trim()} onClick={handleArchive} className="min-h-10 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Archiving...' : 'Confirm Archive'}</button></div>
            </div>
          </section>
        </div>
      )}

      {modal === 'reactivate' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="reactivate-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id="reactivate-title" className="text-lg font-semibold text-gray-900">Reactivate member</h2>
              <p className="mt-1 text-sm text-gray-600">{fullName(selectedMember)} · {selectedMember.member_number}</p>
            </div>
            <div className="space-y-4 p-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <p className="text-sm text-gray-700">This restores active membership and removes the member from Archived Members. Financial history, the permanent Member ID, and profile data stay unchanged. Any existing Member Portal account will be re-enabled without changing its password.</p>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setModal('')} disabled={saving} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={handleReactivate} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><RotateCcw size={16} aria-hidden="true" />{saving ? 'Reactivating…' : 'Confirm Reactivation'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal === '' && deleteConfirmMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 id="delete-account-title" className="text-lg font-semibold text-gray-900">Delete Portal Account</h2>
              <button type="button" onClick={() => setDeleteConfirmMember(null)} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-gray-700">You are about to permanently delete the Member Portal account for <strong>{deleteConfirmMember.member_number} — {fullName(deleteConfirmMember)}</strong>.</p>
              <ul className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <li>This will permanently delete the member's portal account from Supabase.</li>
                <li>The member's AMCOMS record will remain for audit purposes.</li>
                <li>This action cannot be undone.</li>
              </ul>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDeleteConfirmMember(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleDeleteAccount} disabled={deleteAccountLoading} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{deleteAccountLoading ? 'Deleting…' : 'Delete Portal Account'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {view === 'archived' && <p className="text-xs text-gray-500">Reactivate a member when they rejoin. Their financial history and permanent Member ID are preserved.</p>}
    </div>
  );
};

export default MemberManagement;

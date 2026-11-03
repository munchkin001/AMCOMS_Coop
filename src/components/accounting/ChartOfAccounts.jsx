import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, Plus, Search, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const ROLE_THEME = {
  chairman: {
    header: 'from-blue-900 via-blue-800 to-blue-700',
    accent: 'text-blue-800',
    button: 'bg-blue-800 hover:bg-blue-900 focus-visible:ring-blue-700',
    soft: 'bg-blue-50 text-blue-800',
    ring: 'focus:border-blue-700 focus:ring-blue-700/20',
  },
  bookkeeper: {
    header: 'from-purple-950 via-purple-800 to-purple-700',
    accent: 'text-purple-800',
    button: 'bg-purple-700 hover:bg-purple-800 focus-visible:ring-purple-700',
    soft: 'bg-purple-50 text-purple-800',
    ring: 'focus:border-purple-700 focus:ring-purple-700/20',
  },
  treasurer: {
    header: 'from-teal-950 via-teal-800 to-teal-700',
    accent: 'text-teal-800',
    button: 'bg-teal-700 hover:bg-teal-800 focus-visible:ring-teal-700',
    soft: 'bg-teal-50 text-teal-800',
    ring: 'focus:border-teal-700 focus:ring-teal-700/20',
  },
  manager: {
    header: 'from-orange-200 via-orange-300 to-orange-400',
    accent: 'text-orange-900',
    button: 'bg-orange-700 hover:bg-orange-800 focus-visible:ring-orange-700',
    soft: 'bg-orange-100 text-orange-950',
    ring: 'focus:border-orange-600 focus:ring-orange-600/20',
  },
};

const emptyForm = {
  account_code: '',
  account_name: '',
  account_type: 'asset',
  account_category: '',
  parent_account_id: '',
  description: '',
};

const ChartOfAccounts = () => {
  const { staff } = useAuth();
  const role = staff?.role;
  const theme = ROLE_THEME[role] || ROLE_THEME.manager;
  const canManage = role === 'bookkeeper';
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const { data, error: loadError } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type, account_category, parent_account_id, is_active, description, created_at, updated_at')
        .order('account_code');
      if (loadError) throw loadError;
      setAccounts(data || []);
      setError('');
    } catch (loadError) {
      console.error('Unable to load chart of accounts:', loadError);
      setError('Chart of accounts could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!isFormOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) setIsFormOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isFormOpen, saving]);

  useRealtimeSubscription('chart_of_accounts', loadAccounts, null, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return accounts.filter((account) => {
      const matchesSearch = !normalizedSearch || [
        account.account_code,
        account.account_name,
        account.account_category,
        account.description,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
      const matchesType = !typeFilter || account.account_type === typeFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? account.is_active !== false : account.is_active === false);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [accounts, search, statusFilter, typeFilter]);

  const accountCounts = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.is_active !== false).length,
    inactive: accounts.filter((account) => account.is_active === false).length,
  }), [accounts]);
  const invalidParentIds = useMemo(() => {
    if (!editingAccount) return new Set();
    const invalidIds = new Set([editingAccount.id]);
    let addedParent = true;
    while (addedParent) {
      addedParent = false;
      accounts.forEach((account) => {
        if (invalidIds.has(account.parent_account_id) && !invalidIds.has(account.id)) {
          invalidIds.add(account.id);
          addedParent = true;
        }
      });
    }
    return invalidIds;
  }, [accounts, editingAccount]);

  const openNewAccount = () => {
    setEditingAccount(null);
    setForm(emptyForm);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditAccount = (account) => {
    setEditingAccount(account);
    setForm({
      account_code: account.account_code || '',
      account_name: account.account_name || '',
      account_type: account.account_type || 'asset',
      account_category: account.account_category || '',
      parent_account_id: account.parent_account_id || '',
      description: account.description || '',
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setEditingAccount(null);
    setForm(emptyForm);
    setFormError('');
    setIsFormOpen(false);
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    if (!form.account_code.trim() || !form.account_name.trim()) {
      setFormError('Account code and account name are required.');
      return;
    }
    if (editingAccount && form.parent_account_id === editingAccount.id) {
      setFormError('An account cannot be its own parent.');
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      account_code: form.account_code.trim(),
      account_name: form.account_name.trim(),
      account_type: form.account_type,
      account_category: form.account_category.trim() || null,
      parent_account_id: form.parent_account_id || null,
      description: form.description.trim() || null,
    };
    const query = editingAccount
      ? supabase.from('chart_of_accounts').update(payload).eq('id', editingAccount.id)
      : supabase.from('chart_of_accounts').insert(payload);
    let savedAccount;
    let saveError;
    try {
      const result = await query.select('id').maybeSingle();
      savedAccount = result.data;
      saveError = result.error;
    } catch (requestError) {
      console.error('Unable to save chart of accounts entry:', requestError);
      setFormError('The account could not be saved because of a connection error. Please try again.');
      setSaving(false);
      return;
    }
    if (saveError || !savedAccount) {
      console.error('Unable to save chart of accounts entry:', saveError);
      setFormError(saveError?.code === '23505'
        ? 'That account code is already in use. Choose a unique code.'
        : 'The account could not be saved. Check your access and try again.');
      setSaving(false);
      return;
    }

    setSaving(false);
    setIsFormOpen(false);
    setEditingAccount(null);
    setForm(emptyForm);
    await loadAccounts();
  };

  const toggleAccountStatus = async (account) => {
    const nextActive = account.is_active === false;
    if (!nextActive && !window.confirm(`Deactivate ${account.account_code} · ${account.account_name}? It will remain available in historical records.`)) return;
    let updatedAccount;
    let updateError;
    try {
      const result = await supabase
        .from('chart_of_accounts')
        .update({ is_active: nextActive })
        .eq('id', account.id)
        .select('id')
        .maybeSingle();
      updatedAccount = result.data;
      updateError = result.error;
    } catch (requestError) {
      console.error('Unable to update chart of accounts status:', requestError);
      setError('Account status could not be updated because of a connection error.');
      return;
    }
    if (updateError || !updatedAccount) {
      console.error('Unable to update chart of accounts status:', updateError);
      setError('Account status could not be updated. Check your access and try again.');
      return;
    }
    await loadAccounts();
  };

  return (
    <div className="space-y-6">
      <header className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${theme.header} p-6 shadow-lg sm:p-8 ${role === 'manager' ? 'text-orange-950' : 'text-white'}`}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[28px] border-white/15" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role === 'manager' ? 'border-orange-900/10 bg-white/40 text-orange-950' : 'border-white/20 bg-white/10 text-white'}`}>
              <BookOpen aria-hidden="true" className="size-4" />
              Accounting reference
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Chart of Accounts</h1>
            <p className={`mt-2 text-sm leading-6 ${role === 'manager' ? 'text-orange-950/75' : 'text-white/85'}`}>
              Browse the cooperative’s account codes and classifications. Accounts with existing activity are retained for accurate historical records.
            </p>
          </div>
          {canManage && (
            <button type="button" onClick={openNewAccount} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-purple-950 shadow-sm transition hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-purple-800">
              <Plus aria-hidden="true" className="size-4" />
              Add account
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Total accounts', accountCounts.total],
          ['Active accounts', accountCounts.active],
          ['Inactive accounts', accountCounts.inactive],
        ].map(([label, count]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${theme.accent}`}>{count.toLocaleString()}</p>
          </article>
        ))}
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Search accounts</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, name, category..." className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 ${theme.ring}`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            <span className="sr-only">Filter by account type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}>
              <option value="">All account types</option>
              {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            <span className="sr-only">Filter by account status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}>
              <option value="active">Active accounts</option>
              <option value="inactive">Inactive accounts</option>
              <option value="all">All statuses</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading accounts…</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No accounts match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Parent account</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((account) => {
                  const parent = accounts.find((item) => item.id === account.parent_account_id);
                  return (
                    <tr key={account.id} className="transition-colors hover:bg-slate-50">
                      <td className={`whitespace-nowrap px-4 py-3 font-semibold ${theme.accent}`}>{account.account_code}</td>
                      <td className="min-w-52 px-4 py-3">
                        <p className="font-semibold text-slate-900">{account.account_name}</p>
                        {account.description && <p className="mt-0.5 max-w-sm text-xs text-slate-500">{account.description}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-700">{account.account_type}</td>
                      <td className="px-4 py-3 text-slate-700">{account.account_category || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{parent ? `${parent.account_code} · ${parent.account_name}` : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.is_active === false ? 'bg-slate-100 text-slate-600' : theme.soft}`}>
                          {account.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button type="button" onClick={() => openEditAccount(account)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${theme.soft} hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 ${theme.ring}`}>Edit</button>
                          <button type="button" onClick={() => toggleAccountStatus(account)} className={`ml-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${account.is_active === false ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                            <Archive aria-hidden="true" className="size-3.5" />
                            {account.is_active === false ? 'Restore' : 'Deactivate'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Showing {filteredAccounts.length} of {accounts.length} accounts
        </footer>
      </section>

      {canManage && isFormOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={closeForm}>
          <section role="dialog" aria-modal="true" aria-labelledby="coa-form-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className={`flex items-start justify-between gap-4 bg-gradient-to-br ${theme.header} px-5 py-4 text-white`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Bookkeeper account setup</p>
                <h2 id="coa-form-title" className="mt-1 text-xl font-bold">{editingAccount ? 'Edit account' : 'Add account'}</h2>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close account form" className="rounded-lg p-2 text-white hover:bg-white/15"><X aria-hidden="true" className="size-5" /></button>
            </header>
            <form onSubmit={saveAccount} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Account code <span className="text-red-600">*</span>
                  <input autoFocus required value={form.account_code} onChange={(event) => setForm((current) => ({ ...current, account_code: event.target.value }))} className={`mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`} />
                </label>
                <label className="text-sm font-medium text-slate-700">Account name <span className="text-red-600">*</span>
                  <input required value={form.account_name} onChange={(event) => setForm((current) => ({ ...current, account_name: event.target.value }))} className={`mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`} />
                </label>
                <label className="text-sm font-medium text-slate-700">Account type <span className="text-red-600">*</span>
                  <select required value={form.account_type} onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value }))} className={`mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}>
                    {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Category
                  <input value={form.account_category} onChange={(event) => setForm((current) => ({ ...current, account_category: event.target.value }))} className={`mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`} />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Parent account
                  <select value={form.parent_account_id} onChange={(event) => setForm((current) => ({ ...current, parent_account_id: event.target.value }))} className={`mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}>
                    <option value="">No parent account</option>
                    {accounts.filter((account) => !invalidParentIds.has(account.id)).map((account) => (
                      <option key={account.id} value={account.id}>{account.account_code} · {account.account_name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
                  <textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={`mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`} />
                </label>
              </div>
              {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${theme.button}`}>{saving ? 'Saving…' : editingAccount ? 'Save changes' : 'Create account'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;

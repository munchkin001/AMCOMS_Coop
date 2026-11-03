import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import offlineDb from '../../../lib/Offline/OfflineDb';
import { ArrowDownLeft, ArrowLeft, FileText } from 'lucide-react';
import MemberBalanceSummary from './MemberBalanceSummary';
import SearchableMemberSelect from '../../common/SearchableMemberSelect';

const getDefaultSide = (account) => ['Cash on Hand', 'Cash in Bank'].includes(account) ? 'debit' : 'credit';
const receiptParticularsOptions = [
  'Membership Fee',
  'Interest Income',
  'Service Fee Income',
  'Other Income'
];

const CashReceiptForm = ({ onSave, onCancel, transaction = null, title = 'Cash Receipt' }) => {
  const { user, offlineMode } = useAuth();
  const [members, setMembers] = useState([]);
  const [otherMode, setOtherMode] = useState(false);

  useEffect(() => {
    let active = true;
    const cacheKey = user?.id ? `cashbook-members:${user.id}` : null;
    if (!navigator.onLine || offlineMode) {
      if (cacheKey) {
        offlineDb.cachedData.get(cacheKey).then((cached) => {
          if (active) setMembers(cached?.data || []);
        }).catch((error) => {
          console.error('Unable to read cached receipt members:', error);
        });
      }
      return () => { active = false; };
    }
    supabase
      .from('members')
      .select('id, member_number, first_name, middle_name, last_name')
      .eq('membership_status', 'active')
      .is('archived_at', null)
      .order('last_name')
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Unable to load receipt members:', error);
          if (cacheKey) {
            const cached = await offlineDb.cachedData.get(cacheKey);
            if (active) setMembers(cached?.data || []);
          }
          return;
        }
        setMembers(data || []);
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({
              key: cacheKey,
              data: data || [],
              updatedAt: new Date().toISOString(),
            });
          } catch (cacheError) {
            console.error('Unable to cache receipt members:', cacheError);
          }
        }
      })
      .catch((loadError) => {
        console.error('Unable to load receipt members:', loadError);
      });
    return () => { active = false; };
  }, [offlineMode, user?.id]);
  const memberName = (m) => [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');

  const [formData, setFormData] = useState(transaction ? {
    date: transaction.date,
    member: transaction.member || '',
    memberId: transaction.memberId || '',
    particulars: transaction.particulars || '',
    amount: transaction.amount || '',
    paymentMethod: transaction.paymentMethod || 'cash'
  } : {
    date: new Date().toISOString().split('T')[0],
    member: '',
    memberId: '',
    particulars: '',
    amount: '',
    paymentMethod: 'cash'
  });
  const [customParticularsMode, setCustomParticularsMode] = useState(
    Boolean(transaction?.particulars && !receiptParticularsOptions.includes(transaction.particulars))
  );

  const [accountDistribution, setAccountDistribution] = useState(
    transaction && transaction.accountAllocations 
      ? transaction.accountAllocations 
      : [
          { account: 'Cash on Hand', amount: '', side: 'debit' },
          { account: '', amount: '', side: 'credit' }
        ]
  );
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedMember = members.find((member) => member.id === formData.memberId);

  const handleSubmit = async (e, status = 'draft') => {
    e.preventDefault();
    setFormError('');
    if (!formData.date || !formData.member.trim() || !formData.particulars.trim() || Number(formData.amount) <= 0) {
      setFormError('Enter the date, customer, particulars, and a positive amount before saving.');
      return;
    }
    if (/\bloan\b/i.test(formData.particulars)) {
      setFormError('Use the Loan Payment transaction type so the loan schedule and member balance are updated correctly.');
      return;
    }
    const allocations = accountDistribution
      .filter((item) => item.account && Number(item.amount) > 0)
      .map((item) => ({ ...item, amount: Number(item.amount) }));

    if (allocations.some((item) => item.account === 'Other Income' && !item.description?.trim())) {
      setFormError('Enter details for each Other Income allocation.');
      return;
    }

    if (status === 'recorded') {
      const debitTotal = allocations.filter((item) => item.side === 'debit').reduce((sum, item) => sum + item.amount, 0);
      const creditTotal = allocations.filter((item) => item.side === 'credit').reduce((sum, item) => sum + item.amount, 0);
      const receiptAmount = Number(formData.amount);

      if (Math.abs(debitTotal - creditTotal) > 0.01) {
        setFormError(`Debits (₱${debitTotal.toFixed(2)}) and credits (₱${creditTotal.toFixed(2)}) must balance.`);
        return;
      }
      if (Math.abs(debitTotal - receiptAmount) > 0.01) {
        setFormError(`Debit total (₱${debitTotal.toFixed(2)}) must equal amount received (₱${receiptAmount.toFixed(2)}).`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({ ...formData, accountDistribution: allocations, status, type: 'cash-receipt' });
    } catch (error) {
      setFormError(error.message || 'The receipt could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addAccount = () => {
    setAccountDistribution([...accountDistribution, { account: '', amount: '', side: 'credit' }]);
  };

  const updateAccount = (index, field, value) => {
    const updated = [...accountDistribution];
    updated[index] = {
      ...updated[index],
      [field]: value,
      ...(field === 'account'
        ? { side: getDefaultSide(value), ...(value !== 'Other Income' ? { description: '' } : {}) }
        : {})
    };
    setAccountDistribution(updated);
  };

  const removeAccount = (index) => {
    setAccountDistribution(accountDistribution.filter((_, i) => i !== index));
  };

  const accountOptions = [
    'Cash on Hand',
    'Cash in Bank',
    'Membership Fee',
    'Interest Income',
    'Service Fee Income',
    'Other Income'
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7 md:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ArrowDownLeft size={22} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">Cash in · receipt</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">Enter the receipt details and confirm how the amount is distributed.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to transaction types
        </button>
      </header>

      <form onSubmit={(e) => handleSubmit(e, e.nativeEvent.submitter?.value || 'recorded')} className="space-y-5">
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
        {/* Transaction Information */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><FileText size={17} aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Receipt details</h3>
              <p className="mt-0.5 text-xs text-slate-500">Who paid, when it was received, and the reason for the receipt.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Member / Customer *</label>
              <SearchableMemberSelect
                id="cash-receipt-member"
                members={members}
                value={formData.memberId || (otherMode ? 'other' : '')}
                extraOptions={[{ value: 'other', label: 'Non-member / other customer' }]}
                placeholder="Search members by name or number"
                onChange={(value) => {
                  setOtherMode(value === 'other');
                  if (value === 'other' || value === '') {
                    setFormData({ ...formData, memberId: '', member: '' });
                    return;
                  }
                  const selected = members.find((m) => m.id === value);
                  setFormData({ ...formData, memberId: value, member: selected ? memberName(selected) : '' });
                }}
                className="text-sm lg:text-base"
              />
              {otherMode && (
                <input
                  type="text"
                  value={formData.member}
                  onChange={(e) => setFormData({ ...formData, member: e.target.value })}
                  placeholder="Customer name"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                />
              )}
            </div>

            <MemberBalanceSummary memberId={selectedMember?.id} className="sm:col-span-2" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount Received *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">₱</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Particulars *</label>
              <select
                value={customParticularsMode ? 'custom' : formData.particulars}
                onChange={(e) => {
                  const isCustom = e.target.value === 'custom';
                  setCustomParticularsMode(isCustom);
                  setFormData({ ...formData, particulars: isCustom ? '' : e.target.value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                required
              >
                <option value="">Select particulars</option>
                {receiptParticularsOptions.map((particular) => (
                  <option key={particular} value={particular}>{particular}</option>
                ))}
                <option value="custom">Other</option>
              </select>
              {customParticularsMode && (
                <input
                  type="text"
                  value={formData.particulars}
                  onChange={(e) => setFormData({ ...formData, particulars: e.target.value })}
                  placeholder="Enter receipt particulars"
                  aria-label="Custom receipt particulars"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                  required
                />
              )}
            </div>
          </div>
        </section>

        {/* Account Distribution */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Account distribution</h3>
              <p className="mt-1 text-xs text-slate-500">Allocate the receipt across the accounts affected by this transaction.</p>
            </div>
            <button
              type="button"
              onClick={addAccount}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
            >
              + Add account
            </button>
          </div>

          <p className="text-xs lg:text-sm text-gray-600 mb-4">
            Specify which accounts are affected by this receipt
          </p>

          <div className="space-y-3">
            {accountDistribution.map((item, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px_160px]">
                <select
                  value={item.account}
                  onChange={(e) => updateAccount(index, 'account', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                >
                  <option value="">Select Account</option>
                  {accountOptions.map((acc) => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
                <select
                  value={item.side || getDefaultSide(item.account)}
                  onChange={(e) => updateAccount(index, 'side', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                  aria-label={`Debit or credit for ${item.account || `account ${index + 1}`}`}
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <div className="relative w-40">
                  <span className="absolute left-3 top-2 text-gray-500 text-sm">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => updateAccount(index, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                  />
                </div>
                {accountDistribution.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(index)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                    aria-label={`Remove account allocation ${index + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                {item.account === 'Other Income' && (
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) => updateAccount(index, 'description', e.target.value)}
                    placeholder="Describe the other income (e.g., rental income)"
                    aria-label={`Other Income details for allocation ${index + 1}`}
                    required={Number(item.amount) > 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base sm:col-span-3"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs lg:text-sm text-blue-800">
              <strong>Balance:</strong> Debits ₱{accountDistribution.filter((item) => item.side === 'debit').reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toFixed(2)}
              {' '}| Credits ₱{accountDistribution.filter((item) => item.side === 'credit').reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toFixed(2)}
            </p>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:justify-end sm:p-5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to transaction types
          </button>
          <button
            type="submit"
            value="draft"
            disabled={saving}
            className="rounded-lg border border-indigo-200 bg-white px-5 py-2.5 font-semibold text-indigo-800 transition hover:bg-indigo-50 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            value="recorded"
            disabled={saving}
            className="rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60"
          >
            {saving ? 'Recording...' : 'Record Transaction'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CashReceiptForm;

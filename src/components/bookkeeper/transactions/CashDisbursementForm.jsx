import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import offlineDb from '../../../lib/Offline/OfflineDb';
import { ArrowLeft, ArrowUpRight, FileText, Upload, Plus, X, AlertCircle } from 'lucide-react';
import MemberBalanceSummary from './MemberBalanceSummary';

const CashDisbursementForm = ({
  onSave,
  onCancel,
  transaction = null,
  title = 'Cash Disbursement Entry',
  allowExternalPayee = false,
  allowLoanPayable = false,
  onSelectInternalTransfer
}) => {
  const { user, offlineMode } = useAuth();
  const [formData, setFormData] = useState(transaction ? {
    date: transaction.date,
    particulars: transaction.particulars || '',
    memberId: transaction.memberId || '',
    payee: transaction.payee || transaction.member || '',
    termMonths: transaction.termMonths || '12',
    paymentFrequency: transaction.paymentFrequency || 'monthly',
    paymentSource: transaction.paymentSource || 'cash-on-hand',
    paymentAmount: transaction.paymentAmount || transaction.amount || '',
    accountAllocations: transaction.accountAllocations || [{ account: '', amount: '' }],
    supportingDocuments: transaction.supportingDocuments || []
  } : {
    date: new Date().toISOString().split('T')[0],
    particulars: '',
    memberId: '',
    payee: '',
    termMonths: '12',
    paymentFrequency: 'monthly',
    paymentSource: 'cash-on-hand',
    paymentAmount: '',
    accountAllocations: [
      { account: '', amount: '' }
    ],
    supportingDocuments: []
  });

  const [errors, setErrors] = useState({});
  const [isDraft, setIsDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [openPurchases, setOpenPurchases] = useState([]);

  useEffect(() => {
    let active = true;
    const cacheKey = user?.id ? `cashbook-open-purchases:${user.id}` : null;
    if (!navigator.onLine || offlineMode) {
      if (cacheKey) {
        offlineDb.cachedData.get(cacheKey).then((cached) => {
          if (active) setOpenPurchases(cached?.data || []);
        }).catch((error) => console.error('Unable to read cached purchase references:', error));
      }
      return () => { active = false; };
    }
    supabase
      .from('purchases')
      .select('id, purchase_number, net_amount, payment_status, suppliers(supplier_name)')
      .neq('status', 'cancelled')
      .neq('payment_status', 'paid')
      .order('purchase_date', { ascending: false })
      .limit(200)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Unable to load open purchases:', error);
          if (cacheKey) {
            const cached = await offlineDb.cachedData.get(cacheKey);
            if (active) setOpenPurchases(cached?.data || []);
          }
          return;
        }
        setOpenPurchases(data || []);
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({ key: cacheKey, data: data || [], updatedAt: new Date().toISOString() });
          } catch (cacheError) {
            console.error('Unable to cache open purchase references:', cacheError);
          }
        }
      })
      .catch((loadError) => {
        console.error('Unable to load open purchases:', loadError);
      });
    return () => { active = false; };
  }, [offlineMode, user?.id]);

  const handlePurchaseLink = (purchaseNumber) => {
    const purchase = openPurchases.find((item) => item.purchase_number === purchaseNumber);
    if (!purchase) return;
    const supplier = purchase.suppliers?.supplier_name;
    setFormData((prev) => ({
      ...prev,
      particulars: prev.particulars.includes(purchase.purchase_number)
        ? prev.particulars
        : `${prev.particulars.trim() ? `${prev.particulars.trim()} - ` : ''}Payment for purchase ${purchase.purchase_number}${supplier ? ` (${supplier})` : ''}`,
      paymentAmount: prev.paymentAmount || String(purchase.net_amount)
    }));
    setErrors((prev) => ({ ...prev, particulars: '' }));
  };

  useEffect(() => {
    let active = true;
    const cacheKey = user?.id ? `cashbook-members:${user.id}` : null;
    if (!navigator.onLine || offlineMode) {
      if (cacheKey) {
        offlineDb.cachedData.get(cacheKey).then((cached) => {
          if (active) setMembers(cached?.data || []);
        }).catch((error) => console.error('Unable to read cached disbursement members:', error));
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
          console.error('Unable to load disbursement members:', error);
          if (cacheKey) {
            const cached = await offlineDb.cachedData.get(cacheKey);
            if (active) setMembers(cached?.data || []);
          }
          return;
        }
        setMembers(data || []);
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({ key: cacheKey, data: data || [], updatedAt: new Date().toISOString() });
          } catch (cacheError) {
            console.error('Unable to cache disbursement members:', cacheError);
          }
        }
      })
      .catch((loadError) => {
        console.error('Unable to load disbursement members:', loadError);
      });
    return () => { active = false; };
  }, [offlineMode, user?.id]);

  const memberName = (m) => [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');
  const hasLoanPayable = allowLoanPayable && formData.accountAllocations.some(
    (a) => a.account === 'Loan Payable' && parseFloat(a.amount) > 0
  );

  // All account categories from the physical Cash Disbursement Book
  const accountCategories = [
    'Office Supplies',
    'Gasoline',
    'Salary',
    'Loan Payable',
    'Account Payable',
    'Purchases/Cocosugar',
    'BFT',
    'Miscellaneous',
    "Mayor's Permit",
    'Maintenance',
    'Shipment Fee',
    'Representation',
    'Light/Water',
    'Insurance',
    'Interest Expenses',
    'Equipment',
    'Building Improvements',
    'CETF',
    'Mortuary Aid',
    'Labor Fee',
    'Traveling Allowance',
    'Internet',
    'Professional Fee',
    'Communication',
    'Taxes and Licenses',
    'Membership Dues',
    'Training and Seminars',
    'Bank Charges',
    'Depreciation',
    'Other Expenses'
  ].sort();
  const visibleAccountCategories = allowLoanPayable
    ? accountCategories
    : accountCategories.filter((account) => account !== 'Loan Payable');
  const selectedMember = members.find((member) => member.id === formData.memberId);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleAllocationChange = (index, field, value) => {
    const newAllocations = [...formData.accountAllocations];
    newAllocations[index][field] = value;
    setFormData(prev => ({
      ...prev,
      accountAllocations: newAllocations
    }));

    // Clear allocation error
    if (errors.allocations) {
      setErrors(prev => ({ ...prev, allocations: '' }));
    }
  };

  const addAllocationRow = () => {
    setFormData(prev => ({
      ...prev,
      accountAllocations: [
        ...prev.accountAllocations,
        { account: '', amount: '' }
      ]
    }));
  };

  const removeAllocationRow = (index) => {
    if (formData.accountAllocations.length > 1) {
      setFormData(prev => ({
        ...prev,
        accountAllocations: prev.accountAllocations.filter((_, i) => i !== index)
      }));
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setFormData(prev => ({
      ...prev,
      supportingDocuments: [...prev.supportingDocuments, ...files]
    }));
  };

  const removeDocument = (index) => {
    setFormData(prev => ({
      ...prev,
      supportingDocuments: prev.supportingDocuments.filter((_, i) => i !== index)
    }));
  };

  const calculateAllocationTotal = () => {
    return formData.accountAllocations.reduce((total, allocation) => {
      const amount = parseFloat(allocation.amount) || 0;
      return total + amount;
    }, 0);
  };

  const validateForm = (asDraft = false) => {
    const newErrors = {};

    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.particulars.trim()) newErrors.particulars = 'Particulars are required';
    if (allowExternalPayee ? !formData.payee.trim() : !formData.memberId) {
      newErrors[allowExternalPayee ? 'payee' : 'memberId'] = allowExternalPayee
        ? 'Payee is required'
        : 'Select a member';
    }
    if (!formData.paymentAmount || parseFloat(formData.paymentAmount) <= 0) {
      newErrors.paymentAmount = 'Valid payment amount is required';
    }

    if (!asDraft) {
      // Validate allocations
      const validAllocations = formData.accountAllocations.filter(
        a => a.account && a.amount && parseFloat(a.amount) > 0
      );

      if (validAllocations.length === 0) {
        newErrors.allocations = 'At least one account allocation is required';
      }

      // Check if allocation total matches payment amount
      const allocationTotal = calculateAllocationTotal();
      const paymentAmount = parseFloat(formData.paymentAmount) || 0;

      if (Math.abs(allocationTotal - paymentAmount) > 0.01) {
        newErrors.allocations = `Allocation total (₱${allocationTotal.toFixed(2)}) must equal payment amount (₱${paymentAmount.toFixed(2)})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event, asDraft = false) => {
    event.preventDefault();
    setIsDraft(asDraft);
    setErrors((current) => ({ ...current, save: '' }));
    
    if (validateForm(asDraft)) {
      // Filter out empty allocations
      const validAllocations = formData.accountAllocations.filter(
        a => a.account && a.amount && parseFloat(a.amount) > 0
      );

      const submissionData = {
        ...formData,
        payee: allowExternalPayee
          ? formData.payee.trim()
          : selectedMember
            ? memberName(selectedMember)
            : '',
        accountAllocations: validAllocations,
        status: asDraft ? 'draft' : 'recorded',
        type: 'cash-disbursement',
        submittedAt: new Date().toISOString()
      };

      setSaving(true);
      try {
        await onSave(submissionData);
      } catch (error) {
        setErrors((current) => ({ ...current, save: error.message || 'The disbursement could not be saved. Please try again.' }));
      } finally {
        setSaving(false);
      }
    }
  };

  const allocationTotal = calculateAllocationTotal();
  const paymentAmount = parseFloat(formData.paymentAmount) || 0;
  const isBalanced = Math.abs(allocationTotal - paymentAmount) < 0.01;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <ArrowUpRight size={22} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-rose-700">Cash out · disbursement</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">Enter the payee, payment source, and accounts affected by this disbursement.</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to transaction types
        </button>
      </header>
      <form onSubmit={(event) => handleSubmit(event, event.nativeEvent.submitter?.value !== 'recorded')} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        {errors.save && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errors.save}</p>}
        {onSelectInternalTransfer && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-sm text-indigo-900">Transferring between Cash on Hand and Cash in Bank?</p>
            <button type="button" onClick={onSelectInternalTransfer} className="rounded-md px-2 py-1 text-sm font-semibold text-indigo-800 underline underline-offset-2 hover:bg-indigo-100 hover:text-indigo-950">
              Record journal-only transfer
            </button>
          </div>
        )}

        {/* Basic Information */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm"><FileText size={17} aria-hidden="true" /></span>
          <div><h3 className="text-base font-bold text-slate-900">Disbursement details</h3><p className="mt-0.5 text-xs text-slate-500">Recipient, date, and transaction description.</p></div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.date ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date}</p>
            )}
          </div>

          {allowExternalPayee ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payee <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.payee}
                onChange={(event) => handleInputChange('payee', event.target.value)}
                placeholder="Supplier, employee, or other recipient"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.payee ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.payee && <p className="mt-1 text-sm text-red-600">{errors.payee}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Member <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.memberId}
                onChange={(e) => {
                  const memberId = e.target.value;
                  const member = members.find((item) => item.id === memberId);
                  setFormData((current) => ({
                    ...current,
                    memberId,
                    payee: member ? memberName(member) : ''
                  }));
                  if (errors.memberId) setErrors((current) => ({ ...current, memberId: '' }));
                }}
                className={`w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.memberId ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{memberName(m)}</option>
                ))}
              </select>
              {errors.memberId && (
                <p className="mt-1 text-sm text-red-600">{errors.memberId}</p>
              )}
            </div>
          )}
        </div>
        </section>

        {!allowExternalPayee && (
          <MemberBalanceSummary memberId={selectedMember?.id} />
        )}

        {hasLoanPayable && (
          <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 md:grid-cols-2">
            <p className="text-sm text-blue-900 md:col-span-2">
              The Loan Payable amount will be added to the selected member's loan balance.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Loan term</label>
              <select value={formData.termMonths} onChange={(e) => handleInputChange('termMonths', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                <option value="12">1 year</option>
                <option value="24">2 years</option>
                <option value="36">3 years</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment frequency</label>
              <select value={formData.paymentFrequency} onChange={(e) => handleInputChange('paymentFrequency', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        )}
        {openPurchases.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <label htmlFor="linked-purchase" className="block text-sm font-medium text-gray-700 mb-2">
              Paying a supplier purchase? (optional)
            </label>
            <select
              id="linked-purchase"
              defaultValue=""
              onChange={(e) => handlePurchaseLink(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              <option value="">Not linked to a purchase</option>
              {openPurchases.map((purchase) => (
                <option key={purchase.id} value={purchase.purchase_number}>
                  {purchase.purchase_number} - {purchase.suppliers?.supplier_name || 'No supplier'} - ₱{Number(purchase.net_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} ({purchase.payment_status})
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Particulars */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            What is this payment for? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.particulars}
            onChange={(e) => handleInputChange('particulars', e.target.value)}
            placeholder="Describe the disbursement purpose..."
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.particulars ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.particulars && (
            <p className="mt-1 text-sm text-red-600">{errors.particulars}</p>
          )}
        </section>

        {/* Payment Source and Amount */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="mb-4 border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">Payment details</h3>
            <p className="mt-0.5 text-xs text-slate-500">Choose the source of funds and enter the amount paid.</p>
          </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Source <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 transition ${formData.paymentSource === 'cash-on-hand' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  value="cash-on-hand"
                  checked={formData.paymentSource === 'cash-on-hand'}
                  onChange={(e) => handleInputChange('paymentSource', e.target.value)}
                  className="accent-blue-700"
                />
                <span className="text-sm text-gray-700">Cash on Hand</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 transition ${formData.paymentSource === 'cash-in-bank' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  value="cash-in-bank"
                  checked={formData.paymentSource === 'cash-in-bank'}
                  onChange={(e) => handleInputChange('paymentSource', e.target.value)}
                  className="accent-blue-700"
                />
                <span className="text-sm font-medium">Cash in Bank</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">₱</span>
              <input
                type="number"
                step="0.01"
                value={formData.paymentAmount}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => handleInputChange('paymentAmount', e.target.value)}
                placeholder="0.00"
                className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.paymentAmount ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            </div>
            {errors.paymentAmount && (
              <p className="mt-1 text-sm text-red-600">{errors.paymentAmount}</p>
            )}
          </div>
        </div>
        </section>

        {/* Account Allocation Table */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex justify-between items-center mb-3">
            <div><h3 className="text-base font-bold text-slate-900">Account allocation <span className="text-red-500">*</span></h3><p className="mt-0.5 text-xs text-slate-500">Allocate the disbursement across the accounts affected.</p></div>
            <button
              type="button"
              onClick={addAllocationRow}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
            >
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formData.accountAllocations.map((allocation, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3">
                        <select
                          value={allocation.account}
                          onChange={(e) => handleAllocationChange(index, 'account', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                          <option value="">Select Account</option>
                          {visibleAccountCategories.map(account => (
                            <option key={account} value={account}>{account}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-500 text-sm">₱</span>
                          <input
                            type="number"
                            step="0.01"
                            value={allocation.amount}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => handleAllocationChange(index, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {formData.accountAllocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAllocationRow(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      Total Allocation
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      ₱{allocationTotal.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {errors.allocations && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.allocations}
            </p>
          )}

          {/* Balance Check Indicator */}
          {paymentAmount > 0 && (
            <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
              isBalanced 
                ? 'bg-green-50 text-green-700' 
                : 'bg-yellow-50 text-yellow-700'
            }`}>
              <AlertCircle className="w-5 h-5" />
              <div className="text-sm">
                {isBalanced ? (
                  <span className="font-medium">✓ Balanced - Allocation matches payment amount</span>
                ) : (
                  <span>
                    Difference: ₱{Math.abs(allocationTotal - paymentAmount).toFixed(2)}
                    {allocationTotal > paymentAmount ? ' (Over-allocated)' : ' (Under-allocated)'}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Supporting Documents */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3"><h3 className="text-base font-bold text-slate-900">Supporting documents</h3><p className="mt-0.5 text-xs text-slate-500">Attach invoices or other relevant records, if available.</p></div>
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 transition hover:border-blue-300 hover:bg-blue-50/40">
            <input
              type="file"
              id="file-upload"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center cursor-pointer"
            >
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">
                Click to upload or drag and drop
              </span>
              <span className="text-xs text-gray-500 mt-1">
                PDF, JPG, PNG up to 10MB
              </span>
            </label>
          </div>

          {/* Uploaded Files List */}
          {formData.supportingDocuments.length > 0 && (
            <div className="mt-3 space-y-2">
              {formData.supportingDocuments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200"
                >
                  <span className="text-sm text-gray-700 truncate flex-1">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDocument(index)}
                    className="ml-2 text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
          <button
            type="submit"
            value="draft"
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:mr-auto"
          >
            {saving && isDraft ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            value="recorded"
            disabled={saving}
            className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
          >
            {saving && !isDraft ? 'Recording...' : 'Record Disbursement'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to transaction types
          </button>
        </div>
      </form>
    </div>
  );
};

export default CashDisbursementForm;

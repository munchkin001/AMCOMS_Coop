import React, { useState } from 'react';

const getDefaultSide = (account) => ['Cash on Hand', 'Cash in Bank'].includes(account) ? 'debit' : 'credit';

const CashReceiptForm = ({ onSave, onCancel, transaction = null }) => {
  const [formData, setFormData] = useState(transaction ? {
    date: transaction.date,
    receiptNo: transaction.repCvNumber || transaction.receiptNo || '',
    member: transaction.member || '',
    particulars: transaction.particulars || '',
    amount: transaction.amount || '',
    paymentMethod: transaction.paymentMethod || 'cash'
  } : {
    date: new Date().toISOString().split('T')[0],
    receiptNo: '',
    member: '',
    particulars: '',
    amount: '',
    paymentMethod: 'cash'
  });

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

  const handleSubmit = async (e, status = 'draft') => {
    e.preventDefault();
    setFormError('');
    if (!formData.date || !formData.receiptNo.trim() || !formData.member.trim() || !formData.particulars.trim() || Number(formData.amount) <= 0) {
      setFormError('Enter the date, receipt number, customer, particulars, and a positive amount before saving.');
      return;
    }
    const allocations = accountDistribution
      .filter((item) => item.account && Number(item.amount) > 0)
      .map((item) => ({ ...item, amount: Number(item.amount) }));

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
      ...(field === 'account' ? { side: getDefaultSide(value) } : {})
    };
    setAccountDistribution(updated);
  };

  const removeAccount = (index) => {
    setAccountDistribution(accountDistribution.filter((_, i) => i !== index));
  };

  const accountOptions = [
    'Cash on Hand',
    'Cash in Bank',
    'Account Receivable',
    'Loan Receivable',
    'Savings / Time Deposit',
    'Capital Share',
    'Sales',
    'Charge Sales',
    'Marketing',
    'Barangay Food Terminal (BFT)',
    'Membership Fee',
    'Interest Income',
    'Service Fee Income',
    'Other Income'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Cash Receipt</h2>
          <p className="text-sm lg:text-base text-gray-600 mt-1">Record money received by the cooperative</p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={(e) => handleSubmit(e, e.nativeEvent.submitter?.value || 'recorded')} className="space-y-6">
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
        {/* Transaction Information */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Transaction Information</h3>
          
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Receipt / CV No. *</label>
              <input
                type="text"
                value={formData.receiptNo}
                onChange={(e) => setFormData({ ...formData, receiptNo: e.target.value })}
                placeholder="OR-000123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Member / Customer *</label>
              <input
                type="text"
                value={formData.member}
                onChange={(e) => setFormData({ ...formData, member: e.target.value })}
                placeholder="Juan Dela Cruz"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount Received *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">₱</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Particulars *</label>
              <textarea
                value={formData.particulars}
                onChange={(e) => setFormData({ ...formData, particulars: e.target.value })}
                placeholder="Description of receipt (e.g., Loan Payment, Sales, Membership Fee)"
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
                required
              />
            </div>
          </div>
        </div>

        {/* Account Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Account Distribution</h3>
            <button
              type="button"
              onClick={addAccount}
              className="px-3 py-1 text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              + Add Account
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
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            value="draft"
            disabled={saving}
            className="px-6 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 font-medium disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            value="recorded"
            disabled={saving}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-60"
          >
            {saving ? 'Recording...' : 'Record Transaction'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CashReceiptForm;

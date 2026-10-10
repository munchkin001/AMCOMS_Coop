import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Upload, Plus, X, AlertCircle } from 'lucide-react';

const CashDisbursementForm = ({ onSave, onCancel, transaction = null }) => {
  const [formData, setFormData] = useState(transaction ? {
    date: transaction.date,
    particulars: transaction.particulars || '',
    memberId: transaction.memberId || '',
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

  useEffect(() => {
    let active = true;
    supabase
      .from('members')
      .select('id, member_number, first_name, middle_name, last_name')
      .eq('membership_status', 'active')
      .is('archived_at', null)
      .order('last_name')
      .then(({ data }) => {
        if (active) setMembers(data || []);
      });
    return () => { active = false; };
  }, []);

  const memberName = (m) => [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');
  const hasLoanPayable = formData.accountAllocations.some(
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
    if (!formData.memberId) newErrors.memberId = 'Select a member';
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
    <div className="max-w-5xl mx-auto">
      <form onSubmit={(event) => handleSubmit(event, event.nativeEvent.submitter?.value !== 'recorded')} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {errors.save && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errors.save}</p>}
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Cash Disbursement Entry
        </h2>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Member <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.memberId}
              onChange={(e) => handleInputChange('memberId', e.target.value)}
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
        </div>

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
        {/* Particulars */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Particulars <span className="text-red-500">*</span>
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
        </div>

        {/* Payment Source and Amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Source <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="cash-on-hand"
                  checked={formData.paymentSource === 'cash-on-hand'}
                  onChange={(e) => handleInputChange('paymentSource', e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Cash on Hand</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="cash-in-bank"
                  checked={formData.paymentSource === 'cash-in-bank'}
                  onChange={(e) => handleInputChange('paymentSource', e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Cash in Bank</span>
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

        {/* Account Allocation Table */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Account Allocation <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addAllocationRow}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
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
                          {accountCategories.map(account => (
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
        </div>

        {/* Supporting Documents */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Supporting Documents
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
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
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <button
            type="submit"
            value="draft"
            disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {saving && isDraft ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            value="recorded"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {saving && !isDraft ? 'Recording...' : 'Record Disbursement'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CashDisbursementForm;

import { useState } from 'react';

const accounts = ['Cash on Hand', 'Cash in Bank'];
const localDate = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const BankTransferForm = ({ onSave, onCancel }) => {
  const [form, setForm] = useState({
    date: localDate(),
    fromAccount: 'Cash on Hand',
    toAccount: 'Cash in Bank',
    amount: '',
    referenceNumber: '',
    description: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!form.date || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a transfer date, positive amount, and description.');
      return;
    }
    if (form.fromAccount === form.toAccount) {
      setError('Choose different source and destination accounts.');
      return;
    }
    if (form.date > localDate()) {
      setError('Transfer date cannot be in the future.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        type: 'bank-transfer',
        date: form.date,
        fromAccount: form.fromAccount,
        toAccount: form.toAccount,
        amount,
        referenceNumber: form.referenceNumber.trim(),
        particulars: form.description.trim()
      });
    } catch (saveError) {
      setError(saveError.message || 'The transfer could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Internal transfer · journal only</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Cash / Bank Transfer</h2>
          <p className="mt-2 text-sm text-slate-600">
            This posts one balanced journal entry between the two cash accounts. It will not create a cash receipt or disbursement.
          </p>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Transfer date
            <input type="date" required value={form.date} onChange={update('date')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Amount
            <input type="number" min="0.01" step="0.01" required value={form.amount} onChange={update('amount')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Transfer from
            <select value={form.fromAccount} onChange={update('fromAccount')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              {accounts.map((account) => <option key={account}>{account}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Transfer to
            <select value={form.toAccount} onChange={update('toAccount')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              {accounts.map((account) => <option key={account}>{account}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Reference (optional)
            <input value={form.referenceNumber} onChange={update('referenceNumber')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <textarea required rows={3} value={form.description} onChange={update('description')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BankTransferForm;

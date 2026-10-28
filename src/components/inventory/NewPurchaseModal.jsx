import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createPurchase } from '../../lib/inventoryService';
import { toDateString } from '../../lib/dashboardAccounting';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const emptyLine = () => ({ key: Math.random().toString(36).slice(2), itemName: '', unit: '', quantity: '', unitCost: '' });
const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Required = () => <span className="text-red-600" aria-hidden="true"> *</span>;

const NewPurchaseModal = ({ onClose, onSaved }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({
    supplier: '',
    purchaseNumber: '',
    date: toDateString(new Date()),
    notes: '',
    receiveNow: true
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.from('suppliers').select('id, supplier_name').eq('status', 'active').order('supplier_name').then(({ data }) => {
      if (active) setSuppliers(data || []);
    });
    return () => {
      active = false;
    };
  }, []);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const updateLine = (key, field, value) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
    setErrors((current) => ({ ...current, lines: '' }));
  };

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);

  const validate = () => {
    const next = {};
    if (!form.supplier.trim()) next.supplier = 'Supplier is required.';
    if (!form.purchaseNumber.trim()) next.purchaseNumber = 'Purchase / invoice number is required.';
    if (!form.date) next.date = 'Date is required.';
    if (lines.some((line) => !line.itemName.trim())) next.lines = 'Enter an item name on every line.';
    else if (lines.some((line) => !/^\d+$/.test(String(line.quantity).trim()) || Number(line.quantity) <= 0)) {
      next.lines = 'Quantities must be whole numbers greater than zero.';
    } else if (lines.some((line) => line.unitCost === '' || !(Number(line.unitCost) >= 0))) {
      next.lines = 'Enter a unit cost for every line.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSaving(true);
    try {
      await createPurchase({
        supplierName: form.supplier,
        purchaseNumber: form.purchaseNumber,
        date: form.date,
        notes: form.notes,
        receiveNow: form.receiveNow,
        items: lines.map((line) => ({ itemName: line.itemName, unit: line.unit, quantity: Number(line.quantity), unitCost: Number(line.unitCost) }))
      });
      onSaved(form.receiveNow);
    } catch (error) {
      setFormError(`Unable to save purchase: ${error.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
      <form onSubmit={handleSubmit} noValidate className="my-8 w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="purchase-title" className="text-lg font-semibold text-gray-900">New Purchase</h3>
        </div>
        {formError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="po-number" className="mb-1 block text-sm font-medium text-gray-700">Purchase / Invoice No.<Required /></label>
            <input id="po-number" value={form.purchaseNumber} onChange={setField('purchaseNumber')} placeholder="e.g., INV-2026-001" aria-invalid={!!errors.purchaseNumber} className={`${inputClass} ${errors.purchaseNumber ? 'border-red-400' : ''}`} />
            {errors.purchaseNumber && <p role="alert" className="mt-1 text-xs text-red-700">{errors.purchaseNumber}</p>}
          </div>
          <div>
            <label htmlFor="po-supplier" className="mb-1 block text-sm font-medium text-gray-700">Supplier<Required /></label>
            <input id="po-supplier" list="po-suppliers" value={form.supplier} onChange={setField('supplier')} placeholder="Select or type a new supplier" aria-invalid={!!errors.supplier} className={`${inputClass} ${errors.supplier ? 'border-red-400' : ''}`} />
            <datalist id="po-suppliers">
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.supplier_name} />)}
            </datalist>
            {errors.supplier && <p role="alert" className="mt-1 text-xs text-red-700">{errors.supplier}</p>}
          </div>
          <div>
            <label htmlFor="po-date" className="mb-1 block text-sm font-medium text-gray-700">Date<Required /></label>
            <input id="po-date" type="date" value={form.date} onChange={setField('date')} aria-invalid={!!errors.date} className={`${inputClass} ${errors.date ? 'border-red-400' : ''}`} />
            {errors.date && <p role="alert" className="mt-1 text-xs text-red-700">{errors.date}</p>}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Items<Required /></h4>
            <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700">
              <Plus size={16} /> Add item
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-12 items-center gap-2">
                <input aria-label={`Item name ${index + 1}`} placeholder="Item or material (e.g., Coconut sap)" value={line.itemName} onChange={(event) => updateLine(line.key, 'itemName', event.target.value)} className={`${inputClass} col-span-4`} />
                <input aria-label={`Unit ${index + 1}`} placeholder="Unit (kg, pcs)" value={line.unit} onChange={(event) => updateLine(line.key, 'unit', event.target.value)} className={`${inputClass} col-span-2`} />
                <input aria-label={`Quantity ${index + 1}`} type="number" min="1" step="1" placeholder="Qty" value={line.quantity} onChange={(event) => updateLine(line.key, 'quantity', event.target.value)} className={`${inputClass} col-span-2`} />
                <input aria-label={`Unit cost ${index + 1}`} type="number" min="0" step="0.01" placeholder="Unit cost" value={line.unitCost} onChange={(event) => updateLine(line.key, 'unitCost', event.target.value)} className={`${inputClass} col-span-3`} />
                <p className="col-span-1 text-right text-xs text-gray-600">{formatMoney((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</p>
                <button type="button" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="col-span-1 justify-self-end text-gray-400 hover:text-red-600 disabled:opacity-30">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          {errors.lines && <p role="alert" className="mt-2 text-xs text-red-700">{errors.lines}</p>}
          <p className="mt-3 text-right text-sm text-gray-700">Total: <strong>{formatMoney(total)}</strong></p>
        </div>

        <div className="mt-4">
          <label htmlFor="po-notes" className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
          <textarea id="po-notes" rows={2} value={form.notes} onChange={setField('notes')} className={inputClass} />
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.receiveNow} onChange={(event) => setForm((current) => ({ ...current, receiveNow: event.target.checked }))} className="mt-0.5" />
          <span>Receive items now</span>
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewPurchaseModal;

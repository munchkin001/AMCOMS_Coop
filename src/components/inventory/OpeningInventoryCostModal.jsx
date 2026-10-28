import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toDateString } from '../../lib/dashboardAccounting';

const OpeningInventoryCostModal = ({ product, unvaluedQuantity, onClose, onSaved }) => {
  const [unitCost, setUnitCost] = useState('');
  const [receivedDate, setReceivedDate] = useState(() => toDateString(new Date()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!Number.isFinite(Number(unitCost)) || Number(unitCost) <= 0) {
      setError('Enter a verified opening cost greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const { data, error: valueError } = await supabase.rpc('value_existing_inventory_fifo', {
        p_product_id: product.id,
        p_unit_cost: Number(unitCost),
        p_received_date: receivedDate
      });
      if (valueError) throw valueError;
      onSaved(`${Number(data).toLocaleString()} ${product.unit_of_measure} of ${product.product_name} valued at ${formatMoney(unitCost)} per unit.`);
    } catch (valueError) {
      console.error('Unable to record opening FIFO inventory cost:', valueError);
      setError(valueError.message || 'The opening inventory cost could not be recorded.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="opening-cost-title">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="opening-cost-title" className="text-lg font-semibold text-gray-900">Value Existing Stock</h3>
            <p className="mt-1 text-sm text-gray-600">{product.product_name} · {unvaluedQuantity.toLocaleString()} {product.unit_of_measure} have no FIFO cost layer.</p>
          </div>
        </div>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Enter the verified opening cost and date for existing stock. This records a cost layer only; it does not add physical quantity.</p>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <label className="block text-sm font-medium text-gray-700">
          Verified opening cost per unit (₱)
          <input type="number" min="0.01" step="0.01" required value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Date of oldest verified stock in this opening layer
          <input type="date" required max={toDateString(new Date())} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">{saving ? 'Saving…' : 'Record opening cost'}</button>
        </div>
      </form>
    </div>
  );
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default OpeningInventoryCostModal;

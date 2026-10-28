import React, { useState } from 'react';
import { restockProduct } from '../../lib/inventoryService';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

const RestockModal = ({ product, currentStock, onClose, onSaved }) => {
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = Number(quantity);
  const preview = /^\d+$/.test(quantity.trim()) && parsed > 0
    ? { stock: currentStock + parsed, value: parsed * Number(unitCost || 0) }
    : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!/^\d+$/.test(quantity.trim()) || parsed <= 0) {
      setQuantityError('Enter a whole number greater than zero.');
      return;
    }
    if (!Number.isFinite(Number(unitCost)) || Number(unitCost) <= 0) {
      setFormError('Enter the verified per-unit cost from the supplier invoice.');
      return;
    }
    if (!reference.trim()) {
      setFormError('Enter the supplier invoice number to post the payable.');
      return;
    }
    setQuantityError('');
    setSaving(true);
    try {
      await restockProduct({ productId: product.id, quantity: parsed, unitCost: Number(unitCost), supplier, reference });
      onSaved();
    } catch (error) {
      setFormError(`Unable to record restock: ${error.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="restock-title">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 id="restock-title" className="text-lg font-semibold text-gray-900">Restock Product</h3>
            <p className="text-sm text-gray-600">{product.product_name} ({product.product_code})</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600">Current stock: <strong>{currentStock.toLocaleString()} {product.unit_of_measure}</strong></p>
        {formError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <div className="space-y-4">
          <div>
            <label htmlFor="restock-quantity" className="mb-1 block text-sm font-medium text-gray-700">
              Restock Quantity <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <input
              id="restock-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setQuantityError('');
              }}
              aria-invalid={!!quantityError}
              className={`${inputClass} ${quantityError ? 'border-red-400' : ''}`}
              autoFocus
            />
            {quantityError && <p role="alert" className="mt-1 text-xs text-red-700">{quantityError}</p>}
          </div>
          <div>
            <label htmlFor="restock-unit-cost" className="mb-1 block text-sm font-medium text-gray-700">
              Verified cost per unit (₱) <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <input
              id="restock-unit-cost"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="restock-supplier" className="mb-1 block text-sm font-medium text-gray-700">Supplier / Source (optional)</label>
            <input id="restock-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="restock-reference" className="mb-1 block text-sm font-medium text-gray-700">Supplier Invoice No. <span className="text-red-600" aria-hidden="true">*</span></label>
            <input id="restock-reference" required value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} />
          </div>
          {preview && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              New stock: <strong>{preview.stock.toLocaleString()} {product.unit_of_measure}</strong>
              {' · '}This lot value: <strong>₱{preview.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Record Restock'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RestockModal;

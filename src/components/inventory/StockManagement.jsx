import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import {
  STOCK_IN_SOURCES,
  STOCK_OUT_REASONS,
  getQuantityOnHand,
  recordStockMovement
} from '../../lib/inventoryService';

const newForm = () => ({ productId: '', quantity: '', date: toDateString(new Date()), reason: '', remarks: '' });

const StockManagement = () => {
  const [activeTab, setActiveTab] = useState('stock-in');
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(newForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);

  const isStockIn = activeTab === 'stock-in';
  const options = isStockIn ? STOCK_IN_SOURCES : STOCK_OUT_REASONS;
  const selectedProduct = products.find((product) => product.id === form.productId);
  const onHand = selectedProduct ? getQuantityOnHand(selectedProduct) : null;

  const fetchProducts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const { data, error: loadError } = await supabase
      .from('products')
      .select('id, product_name, unit_of_measure, stock_inventory(quantity_on_hand)')
      .eq('is_active', true)
      .order('product_name');
    if (currentRequest !== requestId.current) return;

    if (loadError) setError(`Unable to load products: ${loadError.message}`);
    else {
      setProducts(data || []);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
    return () => {
      requestId.current += 1;
    };
  }, [fetchProducts]);

  useMultipleRealtimeSubscriptions(
    ['products', 'stock_inventory'].map((table) => ({ table, onUpdate: fetchProducts })),
    [fetchProducts]
  );

  const switchTab = (tab) => {
    setActiveTab(tab);
    setForm(newForm());
    setError('');
    setNotice('');
  };

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const choice = options.find((option) => option.label === form.reason);
    if (!choice) {
      setError(isStockIn ? 'Select a source.' : 'Select a reason.');
      return;
    }

    setSaving(true);
    try {
      await recordStockMovement({
        productId: form.productId,
        movementType: choice.type,
        quantity: form.quantity,
        direction: isStockIn ? 1 : -1,
        date: form.date,
        reference: choice.label,
        description: form.remarks.trim() ? `${choice.label}: ${form.remarks.trim()}` : choice.label
      });
      setNotice(`${isStockIn ? 'Stock in' : 'Stock out'} recorded for ${selectedProduct?.product_name}.`);
      setForm(newForm());
      fetchProducts();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-2';
  const tabClass = (tab) => `flex-1 px-6 py-4 font-medium transition-colors ${
    activeTab === tab ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-600 hover:text-gray-900'
  }`;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button type="button" onClick={() => switchTab('stock-in')} className={tabClass('stock-in')}>Stock In</button>
          <button type="button" onClick={() => switchTab('stock-out')} className={tabClass('stock-out')}>Stock Out</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{isStockIn ? 'Record Stock In' : 'Record Stock Out'}</h3>
        <p className="text-gray-600 mb-4">
          {isStockIn
            ? 'Used when products are added to inventory (newly produced, received from suppliers, agricultural products received at BFT, returned products).'
            : 'Used when products leave inventory (sold, transferred, damaged, expired, or other authorized releases).'}
        </p>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

        <div className="space-y-4">
          <div>
            <label htmlFor="stock-product" className={labelClass}>Product</label>
            <select id="stock-product" required value={form.productId} onChange={updateField('productId')} className={inputClass}>
              <option value="">{loading ? 'Loading products…' : 'Select product'}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.product_name}</option>
              ))}
            </select>
            {selectedProduct && (
              <p className="mt-1 text-sm text-gray-500">
                Current stock: {onHand.toLocaleString()} {selectedProduct.unit_of_measure}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="stock-quantity" className={labelClass}>Quantity</label>
              <input
                id="stock-quantity"
                type="number"
                required
                min="1"
                step="1"
                value={form.quantity}
                onChange={updateField('quantity')}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="stock-date" className={labelClass}>Date</label>
              <input id="stock-date" type="date" required value={form.date} onChange={updateField('date')} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="stock-reason" className={labelClass}>{isStockIn ? 'Source' : 'Reason'}</label>
            <select id="stock-reason" required value={form.reason} onChange={updateField('reason')} className={inputClass}>
              <option value="">{isStockIn ? 'Select source' : 'Select reason'}</option>
              {options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="stock-remarks" className={labelClass}>Remarks</label>
            <textarea id="stock-remarks" rows={3} value={form.remarks} onChange={updateField('remarks')} className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className={`w-full px-4 py-3 text-white rounded-lg font-medium disabled:opacity-60 ${
              isStockIn ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving ? 'Saving…' : isStockIn ? 'Record Stock In' : 'Record Stock Out'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StockManagement;

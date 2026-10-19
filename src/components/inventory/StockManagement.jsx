import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import offlineDb from '../../lib/Offline/OfflineDb';
import {
  STOCK_IN_SOURCES,
  STOCK_OUT_REASONS,
  getQuantityOnHand,
  recordStockMovement
} from '../../lib/inventoryService';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const newForm = () => ({ productId: '', quantity: '', unitCost: '', date: toDateString(new Date()), reason: '', reference: '', remarks: '' });

const StockManagement = () => {
  const { user, staff, offlineMode } = useAuth();
  const productCacheKey = user?.id ? `inventory-products:${user.id}` : null;
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
  const selectedSource = options.find((option) => option.label === form.reason);
  const requiresReference = isStockIn && ['purchase', 'return'].includes(selectedSource?.type);
  const onHand = selectedProduct ? getQuantityOnHand(selectedProduct) : null;

  const fetchProducts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const { data, error: loadError } = await supabase
      .from('products')
      .select('id, product_name, unit_of_measure, stock_inventory(quantity_on_hand)')
      .eq('is_active', true)
      .order('product_name');
    if (currentRequest !== requestId.current) return;

    if (loadError) {
      console.error('Unable to refresh inventory products:', loadError);
      try {
        const cachedProducts = productCacheKey ? await offlineDb.cachedData.get(productCacheKey) : null;
        if (currentRequest !== requestId.current) return;
        if (Array.isArray(cachedProducts?.data)) {
          setProducts(cachedProducts.data);
          setError('Using the saved product list. Stock availability will be verified when changes sync.');
        } else {
          setError(getDataLoadErrorMessage(loadError, 'products'));
        }
      } catch (cacheError) {
        console.error('Unable to load cached inventory products:', cacheError);
        setError(getDataLoadErrorMessage(loadError, 'products'));
      }
    } else {
      setProducts(data || []);
      setError('');
      if (productCacheKey) {
        try {
          await offlineDb.cachedData.put({
            key: productCacheKey,
            data: data || [],
            updatedAt: new Date().toISOString()
          });
        } catch (cacheError) {
          console.error('Unable to cache inventory products:', cacheError);
        }
      }
    }
    setLoading(false);
  }, [productCacheKey]);

  useEffect(() => {
    fetchProducts();
    const handleOnline = () => fetchProducts();
    window.addEventListener('online', handleOnline);
    return () => {
      requestId.current += 1;
      window.removeEventListener('online', handleOnline);
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
    if (isStockIn && (!(Number(form.unitCost) > 0) || !Number.isFinite(Number(form.unitCost)))) {
      setError('Enter the verified unit cost for this stock receipt.');
      return;
    }
    if (requiresReference && !form.reference.trim()) {
      setError(selectedSource.type === 'purchase' ? 'Enter the supplier invoice number.' : 'Enter the original sale reference for this return.');
      return;
    }

    setSaving(true);
    try {
      const result = await recordStockMovement({
        productId: form.productId,
        movementType: choice.type,
        quantity: form.quantity,
        direction: isStockIn ? 1 : -1,
        date: form.date,
        reference: requiresReference ? form.reference.trim() : choice.label,
        description: form.remarks.trim() ? `${choice.label}: ${form.remarks.trim()}` : choice.label,
        unitCost: isStockIn ? Number(form.unitCost) : null,
        userId: user?.id,
        actorRole: staff?.role,
        actorName: staff?.full_name,
        allowLocalQueue: offlineMode || !navigator.onLine
      });
      if (result.status === 'synced') {
        setNotice(`${isStockIn ? 'Stock in' : 'Stock out'} synchronized for ${selectedProduct?.product_name}.`);
        fetchProducts();
      } else {
        setNotice(`${isStockIn ? 'Stock in' : 'Stock out'} saved on this device and queued for sync.`);
        if (result.status === 'failed') {
          setError(`The server could not apply this movement yet: ${result.lastError}`);
        }
      }
      setForm(newForm());
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
            : 'Use for transfers, damaged, expired, lost, or other authorized releases. Record sales through the Sales transaction so revenue and stock stay linked.'}
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
          {isStockIn && (
            <div>
              <label htmlFor="stock-unit-cost" className={labelClass}>Verified unit cost (₱)</label>
              <input
                id="stock-unit-cost"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.unitCost}
                onChange={updateField('unitCost')}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500">Use the invoice cost for purchases or the recorded production cost per finished unit.</p>
            </div>
          )}
          {requiresReference && (
            <div>
              <label htmlFor="stock-reference" className={labelClass}>{selectedSource.type === 'purchase' ? 'Supplier invoice number' : 'Original sale reference'}</label>
              <input id="stock-reference" type="text" required value={form.reference} onChange={updateField('reference')} className={inputClass} />
            </div>
          )}
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

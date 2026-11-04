import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Package, PackageCheck, Sparkles } from 'lucide-react';
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

  const inputClass = 'inventory-stock-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-semibold text-slate-700';

  return (
    <div className="inventory-stock-page mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime-100 text-lime-800 shadow-sm ring-1 ring-lime-200">
            <Package aria-hidden="true" size={24} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-800">Inventory operations</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Stock Management</h1>
            <p className="mt-1 text-sm text-slate-600">Record inventory receipts and authorized stock releases.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lime-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm">
          <Sparkles aria-hidden="true" className="size-4 text-lime-700" />
          <span>{products.length} active {products.length === 1 ? 'product' : 'products'}</span>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-lime-200/80 bg-white shadow-[0_12px_36px_rgba(63,98,18,0.08)]">
        <div className="grid grid-cols-2 gap-2 border-b border-lime-100 bg-lime-50/70 p-2 sm:gap-3 sm:p-3">
          <button
            type="button"
            onClick={() => switchTab('stock-in')}
            aria-pressed={isStockIn}
            className={`inventory-stock-tab flex min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-left transition sm:px-5 ${
              isStockIn ? 'inventory-stock-tab-active bg-white text-green-900 shadow-md ring-1 ring-lime-200' : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isStockIn ? 'bg-lime-100 text-green-800' : 'bg-white text-slate-500'}`}>
              <ArrowDownToLine aria-hidden="true" size={20} />
            </span>
            <span>
              <span className="block text-sm font-bold">Stock In</span>
              <span className="mt-0.5 hidden text-xs font-normal text-slate-500 sm:block">Receive or return products</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('stock-out')}
            aria-pressed={!isStockIn}
            className={`inventory-stock-tab flex min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-left transition sm:px-5 ${
              !isStockIn ? 'inventory-stock-tab-active bg-white text-green-900 shadow-md ring-1 ring-lime-200' : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${!isStockIn ? 'bg-lime-100 text-green-800' : 'bg-white text-slate-500'}`}>
              <ArrowUpFromLine aria-hidden="true" size={20} />
            </span>
            <span>
              <span className="block text-sm font-bold">Stock Out</span>
              <span className="mt-0.5 hidden text-xs font-normal text-slate-500 sm:block">Record authorized releases</span>
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="border-b border-slate-100 px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-800">{isStockIn ? 'Add to available inventory' : 'Adjust available inventory'}</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{isStockIn ? 'Record Stock In' : 'Record Stock Out'}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {isStockIn
                    ? 'Record products received from suppliers, production, BFT, or customer returns.'
                    : 'Record transfers, damage, expiry, loss, or other authorized releases. Enter sales through Sales so inventory and revenue remain linked.'}
                </p>
              </div>
              <span className="rounded-full border border-lime-200 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-green-800">
                {isStockIn ? 'Inventory increase' : 'Inventory decrease'}
              </span>
            </div>
          </div>

          <div className="space-y-5 px-5 py-6 sm:px-8">
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="stock-product" className={labelClass}>Product <span className="text-red-600">*</span></label>
                <select id="stock-product" required value={form.productId} onChange={updateField('productId')} className={inputClass}>
                  <option value="">{loading ? 'Loading products…' : 'Select a product'}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.product_name}</option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="inventory-stock-availability mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lime-200 bg-lime-50/70 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-white text-green-800 shadow-sm">
                        <PackageCheck aria-hidden="true" size={19} />
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Current available stock</p>
                        <p className="text-sm font-bold text-slate-900">{onHand.toLocaleString()} {selectedProduct.unit_of_measure}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-800 ring-1 ring-lime-200">
                      {isStockIn ? 'Will increase' : 'Will decrease'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="stock-quantity" className={labelClass}>Quantity <span className="text-red-600">*</span>{selectedProduct ? ` (${selectedProduct.unit_of_measure})` : ''}</label>
                <input
                  id="stock-quantity"
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={updateField('quantity')}
                  placeholder="Enter whole-number quantity"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="stock-date" className={labelClass}>Movement date <span className="text-red-600">*</span></label>
                <div className="relative">
                  <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input id="stock-date" type="date" required value={form.date} onChange={updateField('date')} className={`${inputClass} pl-10`} />
                </div>
              </div>
              <div>
                <label htmlFor="stock-reason" className={labelClass}>{isStockIn ? 'Source' : 'Reason'} <span className="text-red-600">*</span></label>
                <select id="stock-reason" required value={form.reason} onChange={updateField('reason')} className={inputClass}>
                  <option value="">{isStockIn ? 'Select a source' : 'Select a reason'}</option>
                  {options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
                </select>
              </div>
              {isStockIn && (
                <div>
                  <label htmlFor="stock-unit-cost" className={labelClass}>Verified unit cost (₱) <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₱</span>
                    <input
                      id="stock-unit-cost"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={form.unitCost}
                      onChange={updateField('unitCost')}
                      placeholder="0.00"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </div>
              )}
              {requiresReference && (
                <div className="md:col-span-2">
                  <label htmlFor="stock-reference" className={labelClass}>
                    {selectedSource.type === 'purchase' ? 'Supplier invoice number' : 'Original sale reference'} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="stock-reference"
                    type="text"
                    required
                    value={form.reference}
                    onChange={updateField('reference')}
                    placeholder={selectedSource.type === 'purchase' ? 'Enter the invoice number' : 'Enter the original sale reference'}
                    className={inputClass}
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <label htmlFor="stock-remarks" className={labelClass}>Remarks <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  id="stock-remarks"
                  rows={3}
                  value={form.remarks}
                  onChange={updateField('remarks')}
                  placeholder="Add any useful notes about this movement"
                  className={`${inputClass} resize-y`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="text-xs text-slate-500"><span className="font-semibold text-red-600">*</span> Required fields</p>
            <button
              type="submit"
              disabled={saving || loading}
              className="inventory-stock-submit inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStockIn ? <ArrowDownToLine aria-hidden="true" size={17} /> : <ArrowUpFromLine aria-hidden="true" size={17} />}
              {saving ? 'Saving movement…' : isStockIn ? 'Record Stock In' : 'Record Stock Out'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default StockManagement;

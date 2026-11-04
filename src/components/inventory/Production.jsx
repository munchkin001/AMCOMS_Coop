import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CalendarDays, ClipboardList, Factory, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import offlineDb from '../../lib/Offline/OfflineDb';
import { queueOperation } from '../../lib/Offline/syncQueue';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const newForm = () => ({
  date: toDateString(new Date()),
  productId: '',
  rawMaterial: '',
  quantity: '',
  unitCost: '',
  batch: '',
  remarks: ''
});

const makeProductionNumber = (date) =>
  `PR-${date.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

const Production = () => {
  const { user, staff, offlineMode } = useAuth();
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(newForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);

  const selectedProduct = products.find((product) => product.id === form.productId);

  const fetchData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const [recordResult, productResult] = await Promise.all([
      supabase
        .from('production_records')
        .select('id, production_number, production_date, quantity_produced, batch_number, notes, status, products(product_name, unit_of_measure)')
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('products').select('id, product_name, unit_of_measure').eq('is_active', true).order('product_name')
    ]);
    if (currentRequest !== requestId.current) return;

    const failure = recordResult.error || productResult.error;
    if (failure) {
      console.error('Unable to load production data:', failure);
      const cacheKey = user?.id ? `inventory-products:${user.id}` : null;
      const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
      if (Array.isArray(cached?.data)) {
        setProducts(cached.data);
        setError('Using the product list saved on this device. Production remains pending until the server validates stock and cost.');
      } else {
        setError(getDataLoadErrorMessage(failure, 'production data'));
      }
    } else {
      setRecords(recordResult.data || []);
      setProducts(productResult.data || []);
      setError('');
      if (user?.id) {
        try {
          await offlineDb.cachedData.put({
            key: `inventory-products:${user.id}`,
            data: productResult.data || [],
            updatedAt: new Date().toISOString(),
          });
        } catch (cacheError) {
          console.error('Unable to cache production products:', cacheError);
        }
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchData();
    return () => {
      requestId.current += 1;
    };
  }, [fetchData]);

  useMultipleRealtimeSubscriptions(
    ['production_records', 'products'].map((table) => ({ table, onUpdate: fetchData })),
    [fetchData]
  );

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const quantity = Math.round(Number(form.quantity));
    const unitCost = Number(form.unitCost);
    if (!form.productId || !(quantity > 0) || !Number.isFinite(unitCost) || unitCost <= 0) {
      setError('Select a product, enter a positive whole quantity, and enter the verified cost per finished unit.');
      return;
    }

    setSaving(true);
    const productionNumber = makeProductionNumber(form.date);
    const notes = [form.rawMaterial.trim() && `Raw material: ${form.rawMaterial.trim()}`, form.remarks.trim()]
      .filter(Boolean)
      .join('. ');

    try {
      const payload = {
        p_production_number: productionNumber,
        p_product_id: form.productId,
        p_quantity: quantity,
        p_production_date: form.date,
        p_unit_cost: unitCost,
        p_batch_number: form.batch.trim() || null,
        p_notes: notes || null
      };
      if (!navigator.onLine || offlineMode) {
        await queueOperation({
          type: 'production_record',
          payload,
          userId: user?.id,
          actorRole: staff?.role,
          actorName: staff?.full_name,
          allowLocalQueue: true,
          entityId: form.productId,
          summary: `Production record ${productionNumber} queued`,
          details: {
            product: selectedProduct?.product_name || 'Saved product',
            quantity,
            date: form.date,
            localRecordedAt: new Date().toISOString(),
          },
        });
        setNotice(`Production ${productionNumber} is pending on this device. Stock and production records have not changed on the server.`);
      } else {
        const { error: productionError } = await supabase.rpc('record_production_with_inventory', payload);
        if (productionError) throw productionError;
        setNotice(`Production recorded: ${quantity.toLocaleString()} ${selectedProduct?.unit_of_measure || ''} of ${selectedProduct?.product_name}. Stock updated.`);
        fetchData();
      }
      setForm(newForm());
    } catch (productionError) {
      setError(`Production and stock were not saved: ${productionError.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'inventory-production-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-semibold text-slate-700';

  return (
    <div className="inventory-production-page mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime-100 text-lime-800 shadow-sm ring-1 ring-lime-200">
            <Factory aria-hidden="true" size={24} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-800">Inventory operations</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Production</h1>
            <p className="mt-1 text-sm text-slate-600">Turn verified inputs into finished goods and update stock in one step.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lime-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm">
          <ClipboardList aria-hidden="true" className="size-4 text-lime-700" />
          <span>{records.length} recent {records.length === 1 ? 'record' : 'records'}</span>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="overflow-hidden rounded-2xl border border-lime-200/80 bg-white shadow-[0_12px_36px_rgba(63,98,18,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-lime-100 bg-gradient-to-r from-white via-white to-lime-50/70 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-lime-100 text-green-800">
              <Sparkles aria-hidden="true" size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-800">New production</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Create a production record</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Record finished quantity and verified cost to update inventory accurately.</p>
            </div>
          </div>
          <span className="rounded-full border border-lime-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-800">Finished goods</span>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-8">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="production-date" className={labelClass}>Production date <span className="text-red-600">*</span></label>
              <div className="relative">
                <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input id="production-date" type="date" required value={form.date} onChange={updateField('date')} className={`${inputClass} pl-10`} />
              </div>
            </div>
            <div>
              <label htmlFor="production-product" className={labelClass}>Finished product <span className="text-red-600">*</span></label>
              <select id="production-product" required value={form.productId} onChange={updateField('productId')} className={inputClass}>
                <option value="">{loading ? 'Loading products…' : 'Select a product'}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="production-quantity" className={labelClass}>
                Quantity produced{selectedProduct ? ` (${selectedProduct.unit_of_measure})` : ''} <span className="text-red-600">*</span>
              </label>
              <input id="production-quantity" type="number" required min="1" step="1" value={form.quantity} onChange={updateField('quantity')} placeholder="Enter whole-number quantity" className={inputClass} />
            </div>
            <div>
              <label htmlFor="production-unit-cost" className={labelClass}>Verified cost per finished unit (₱) <span className="text-red-600">*</span></label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₱</span>
                <input id="production-unit-cost" type="number" required min="0.01" step="0.01" value={form.unitCost} onChange={updateField('unitCost')} placeholder="0.00" className={`${inputClass} pl-8`} />
              </div>
            </div>
            <div>
              <label htmlFor="production-material" className={labelClass}>Raw material / input <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="production-material" type="text" value={form.rawMaterial} onChange={updateField('rawMaterial')} placeholder="e.g., Coconut sap" className={inputClass} />
            </div>
            <div>
              <label htmlFor="production-batch" className={labelClass}>Batch number <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="production-batch" type="text" value={form.batch} onChange={updateField('batch')} placeholder="Enter batch number" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="production-remarks" className={labelClass}>Remarks <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="production-remarks" rows={3} value={form.remarks} onChange={updateField('remarks')} placeholder="Add any useful production notes" className={`${inputClass} resize-y`} />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-slate-500"><span className="font-semibold text-red-600">*</span> Required fields · Cost is used to value finished inventory.</p>
          <button type="submit" disabled={saving || loading} className="inventory-production-submit inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            <ArrowDownToLine aria-hidden="true" size={17} />
            {saving ? 'Saving production…' : 'Record Production'}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-lime-200/80 bg-white shadow-[0_12px_36px_rgba(63,98,18,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lime-100 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lime-100 text-green-800">
              <ClipboardList aria-hidden="true" size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recent Production Records</h2>
              <p className="text-sm text-slate-500">Latest production activity and recorded output</p>
            </div>
          </div>
          <span className="rounded-full bg-lime-50 px-3 py-1 text-xs font-semibold text-green-800 ring-1 ring-lime-200">{records.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Product</th>
                <th className="text-left">Notes</th>
                <th className="text-right">Quantity</th>
                <th className="text-left">Batch / Record No.</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading production records…</td></tr>}
              {!loading && records.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-slate-500">No production has been recorded yet.</td></tr>
              )}
              {records.map((record) => (
                <tr key={record.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap text-sm text-slate-700">{record.production_date}</td>
                  <td className="text-sm font-semibold text-slate-900">{record.products?.product_name || 'Unknown product'}</td>
                  <td className="max-w-sm text-sm text-slate-600">{record.notes || '—'}</td>
                  <td className="whitespace-nowrap text-right text-sm font-bold text-green-800">{Number(record.quantity_produced).toLocaleString()} {record.products?.unit_of_measure}</td>
                  <td className="whitespace-nowrap text-sm text-slate-600"><span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs">{record.batch_number || record.production_number}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Production;

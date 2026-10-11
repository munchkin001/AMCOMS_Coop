import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { recordStockMovement } from '../../lib/inventoryService';

const newForm = () => ({
  date: toDateString(new Date()),
  productId: '',
  rawMaterial: '',
  quantity: '',
  batch: '',
  remarks: ''
});

const makeProductionNumber = (date) =>
  `PR-${date.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

const Production = () => {
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
    if (failure) setError(`Unable to load production records: ${failure.message}`);
    else {
      setRecords(recordResult.data || []);
      setProducts(productResult.data || []);
      setError('');
    }
    setLoading(false);
  }, []);

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
    if (!form.productId || !(quantity > 0)) {
      setError('Select a product and enter a quantity greater than zero.');
      return;
    }

    setSaving(true);
    const productionNumber = makeProductionNumber(form.date);
    const notes = [form.rawMaterial.trim() && `Raw material: ${form.rawMaterial.trim()}`, form.remarks.trim()]
      .filter(Boolean)
      .join('. ');

    const { data: record, error: insertError } = await supabase
      .from('production_records')
      .insert({
        production_number: productionNumber,
        product_id: form.productId,
        quantity_produced: quantity,
        production_date: form.date,
        batch_number: form.batch.trim() || null,
        status: 'completed',
        notes: notes || null
      })
      .select('id')
      .single();

    if (insertError) {
      setSaving(false);
      setError(`Unable to record production: ${insertError.message}`);
      return;
    }

    try {
      await recordStockMovement({
        productId: form.productId,
        movementType: 'production',
        quantity,
        direction: 1,
        date: form.date,
        reference: form.batch.trim() || productionNumber,
        description: `Production ${productionNumber}`
      });
      setNotice(`Production recorded: ${quantity.toLocaleString()} ${selectedProduct?.unit_of_measure || ''} of ${selectedProduct?.product_name}. Stock updated.`);
      setForm(newForm());
      fetchData();
    } catch (stockError) {
      await supabase.from('production_records').delete().eq('id', record.id);
      setError(`Production was not saved because stock could not be updated: ${stockError.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-2';

  return (
    <div className="space-y-6">
      <p className="text-gray-600">Record and monitor coconut sugar production and other processing activities</p>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">New Production Record</h3>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="production-date" className={labelClass}>Production Date</label>
              <input id="production-date" type="date" required value={form.date} onChange={updateField('date')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="production-product" className={labelClass}>Product</label>
              <select id="production-product" required value={form.productId} onChange={updateField('productId')} className={inputClass}>
                <option value="">{loading ? 'Loading products…' : 'Select product'}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="production-material" className={labelClass}>Raw Material / Input</label>
            <input id="production-material" type="text" value={form.rawMaterial} onChange={updateField('rawMaterial')} placeholder="e.g., Coconut Sap" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="production-quantity" className={labelClass}>
                Quantity Produced{selectedProduct ? ` (${selectedProduct.unit_of_measure})` : ''}
              </label>
              <input id="production-quantity" type="number" required min="1" step="1" value={form.quantity} onChange={updateField('quantity')} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label htmlFor="production-batch" className={labelClass}>Batch Number</label>
              <input id="production-batch" type="text" value={form.batch} onChange={updateField('batch')} placeholder="Optional" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="production-remarks" className={labelClass}>Remarks</label>
            <textarea id="production-remarks" rows={2} value={form.remarks} onChange={updateField('remarks')} className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Record Production'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Production Records</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Product</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Notes</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Quantity</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Batch / Record No.</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="py-10 text-center text-gray-500">Loading production records…</td></tr>}
              {!loading && records.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-500">No production has been recorded yet.</td></tr>
              )}
              {records.map((record) => (
                <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">{record.production_date}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{record.products?.product_name || 'Unknown product'}</td>
                  <td className="py-3 px-6 text-sm text-gray-600">{record.notes || '-'}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-semibold">
                    {Number(record.quantity_produced).toLocaleString()} {record.products?.unit_of_measure}
                  </td>
                  <td className="py-3 px-6 text-sm text-gray-600 font-mono">{record.batch_number || record.production_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Production;

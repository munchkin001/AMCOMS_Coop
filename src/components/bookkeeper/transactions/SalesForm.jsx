import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import offlineDb from '../../../lib/Offline/OfflineDb';
import { getDataLoadErrorMessage } from '../../../lib/errorHandler';

const today = () => new Date().toISOString().slice(0, 10);

const createReference = (prefix = 'SAL') => `${prefix}-${today().replace(/-/g, '')}-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const SalesForm = ({ onSave, onCancel }) => {
  const { user, offlineMode } = useAuth();
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [outstandingSales, setOutstandingSales] = useState([]);
  const [cancellableSales, setCancellableSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerMode, setCustomerMode] = useState('other');
  const [flow, setFlow] = useState('sale');
  const [collectionOrderId, setCollectionOrderId] = useState('');
  const [cancellationOrderId, setCancellationOrderId] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [returnQuantities, setReturnQuantities] = useState({});
  const [form, setForm] = useState({
    date: today(),
    reference: createReference(),
    customerName: '',
    memberId: '',
    productId: '',
    itemDescription: '',
    quantity: '1',
    amount: '',
    paymentType: 'cash',
    paymentMethod: 'cash',
    cashAccount: 'Cash on Hand',
    revenueAccount: 'Sales'
  });

  const selectedProduct = products.find((product) => product.id === form.productId);
  const unitPrice = useMemo(() => {
    const quantity = Number(form.quantity);
    const amount = Number(form.amount);
    return quantity > 0 && amount > 0 ? amount / quantity : 0;
  }, [form.amount, form.quantity]);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      const cacheKey = user?.id ? `sales-options:${user.id}` : null;
      const loadCachedOptions = async (message) => {
        const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
        if (!active) return;
        if (!cached?.data) {
          setError(message);
          setLoading(false);
          return;
        }
        const options = cached.data;
        setProducts(options.products || []);
        setMembers(options.members || []);
        setRevenueAccounts(options.revenueAccounts || []);
        setOutstandingSales(options.outstandingSales || []);
        setCancellableSales([]);
        setCollectionOrderId(options.outstandingSales?.[0]?.id || '');
        setError(`${message} Showing the saved options; the server will validate stock, balances, and eligibility when this operation syncs.`);
        setLoading(false);
      };
      if (!navigator.onLine || offlineMode) {
        await loadCachedOptions('You are offline.');
        return;
      }
      const [productResult, memberResult, accountResult, saleResult] = await Promise.all([
        supabase.from('products')
          .select('id, product_name, product_code, unit_of_measure')
          .eq('is_active', true)
          .order('product_name'),
        supabase.from('members')
          .select('id, member_number, first_name, middle_name, last_name')
          .eq('membership_status', 'active')
          .is('archived_at', null)
          .order('last_name'),
        supabase.from('chart_of_accounts')
          .select('account_name')
          .eq('account_type', 'revenue')
          .eq('is_active', true)
          .order('account_name'),
        supabase.from('sales_orders')
          .select('id, order_number, customer_name, net_amount, amount_paid, payment_status, order_status, cash_receipt_id, sales_order_items(id, product_id, item_description, quantity, product:products(product_name))')
          .in('payment_status', ['pending', 'partial'])
          .order('order_date', { ascending: true })
      ]);
      if (!active) return;
      const failure = productResult.error || memberResult.error || accountResult.error || saleResult.error;
      if (failure) {
        await loadCachedOptions(getDataLoadErrorMessage(failure, 'sales options'));
      }
      else {
        const openSales = saleResult.data || [];
        const eligibleForCancellation = openSales.filter((sale) =>
          !sale.cash_receipt_id &&
          sale.order_status !== 'cancelled' &&
          Number(sale.amount_paid || 0) <= 0.01
        );
        const stockResult = eligibleForCancellation.length
          ? await supabase.from('stock_movements')
            .select('product_id, reference_number, quantity, movement_type')
            .in('reference_number', eligibleForCancellation.map((sale) => sale.order_number))
            .in('movement_type', ['sale', 'return'])
          : { data: [], error: null };
        if (!active) return;
        if (stockResult.error) {
          await loadCachedOptions(getDataLoadErrorMessage(stockResult.error, 'sale return quantities'));
          return;
        }
        const movementsBySale = new Map();
        for (const movement of stockResult.data || []) {
          const key = `${movement.reference_number}:${movement.product_id}`;
          const current = movementsBySale.get(key) || { sold: 0, returned: 0 };
          if (movement.movement_type === 'sale') current.sold += Number(movement.quantity || 0);
          if (movement.movement_type === 'return') current.returned += Number(movement.quantity || 0);
          movementsBySale.set(key, current);
        }
        const salesWithReturnableItems = eligibleForCancellation.map((sale) => {
          const itemMap = new Map();
          for (const item of sale.sales_order_items || []) {
            if (!item.product_id) continue;
            if (!itemMap.has(item.product_id)) itemMap.set(item.product_id, {
              product_id: item.product_id,
              description: item.product?.product_name || item.item_description,
            });
          }
          return {
            ...sale,
            returnableItems: [...itemMap.values()].map((item) => {
              const quantities = movementsBySale.get(`${sale.order_number}:${item.product_id}`) || { sold: 0, returned: 0 };
              return {
                ...item,
                sold: quantities.sold,
                returned: quantities.returned,
                remaining: Math.max(quantities.sold - quantities.returned, 0),
              };
            }),
          };
        });
        setProducts(productResult.data || []);
        setMembers(memberResult.data || []);
        setRevenueAccounts(accountResult.data || []);
        setOutstandingSales(openSales.filter((sale) => Number(sale.net_amount) > Number(sale.amount_paid || 0)));
        setCollectionOrderId(openSales.find((sale) => Number(sale.net_amount) > Number(sale.amount_paid || 0))?.id || '');
        setCancellableSales(salesWithReturnableItems);
        setCancellationOrderId(salesWithReturnableItems[0]?.id || '');
        if ((accountResult.data || []).some((account) => account.account_name === 'Sales')) {
          setForm((current) => ({ ...current, revenueAccount: 'Sales' }));
        } else if (accountResult.data?.[0]) {
          setForm((current) => ({ ...current, revenueAccount: accountResult.data[0].account_name }));
        }
        if (cacheKey) {
          try {
            await offlineDb.cachedData.put({
              key: cacheKey,
              data: {
                products: productResult.data || [],
                members: memberResult.data || [],
                revenueAccounts: accountResult.data || [],
                outstandingSales: (saleResult.data || []).filter(
                  (sale) => Number(sale.net_amount) > Number(sale.amount_paid || 0)
                ),
              },
              updatedAt: new Date().toISOString(),
            });
          } catch (cacheError) {
            console.error('Unable to cache sales options:', cacheError);
          }
        }
        setLoading(false);
      }
    };
    loadOptions().catch((loadError) => {
      if (!active) return;
      setError(getDataLoadErrorMessage(loadError, 'sales options'));
      setLoading(false);
    });
    return () => { active = false; };
  }, [offlineMode, user?.id]);

  const getMemberName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (flow === 'cancel') {
      const sale = cancellableSales.find((item) => item.id === cancellationOrderId);
      const returnedItems = (sale?.returnableItems || [])
        .map((item) => ({ product_id: item.product_id, quantity: Number(returnQuantities[item.product_id] || 0) }))
        .filter((item) => item.quantity > 0);
      if (!navigator.onLine || offlineMode) {
        setError('Reconnect before cancelling a sale. The server must validate the reversal and inventory return together.');
        return;
      }
      if (!sale || !cancellationReason.trim()) {
        setError('Select an unpaid credit sale and enter a cancellation reason.');
        return;
      }
      if (returnedItems.some((item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity > sale.returnableItems.find((candidate) => candidate.product_id === item.product_id)?.remaining
      )) {
        setError('Returned quantities must be whole numbers and cannot exceed the remaining quantity sold.');
        return;
      }
      setSaving(true);
      try {
        await onSave({
          action: 'cancel-credit-sale',
          p_sales_order_id: sale.id,
          p_reason: cancellationReason.trim(),
          p_returned_items: returnedItems,
        });
      } catch (saveError) {
        setError(saveError.message || 'The credit sale could not be cancelled.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (flow === 'collection') {
      const sale = outstandingSales.find((item) => item.id === collectionOrderId);
      const outstanding = sale ? Number(sale.net_amount) - Number(sale.amount_paid || 0) : 0;
      const isOffline = !navigator.onLine || offlineMode;
      if (!form.date || !form.reference.trim() || !sale || !Number.isFinite(amount) || amount <= 0
          || (!isOffline && amount > outstanding)) {
        setError('Select an outstanding credit sale and enter a collection amount greater than zero and no more than its balance.');
        return;
      }
      setSaving(true);
      try {
        await onSave({
          p_sale: {
            flow: 'collection',
            transaction_date: form.date,
            reference_number: form.reference.trim(),
            sales_order_id: sale.id,
            amount,
            payment_method: form.paymentMethod,
            cash_account: form.cashAccount
          }
        });
      } catch (saveError) {
        setError(saveError.message || 'The sale collection could not be recorded.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const quantity = Number(form.quantity);
    const itemDescription = form.itemDescription.trim() || selectedProduct?.product_name || '';
    const customerName = customerMode === 'member'
      ? getMemberName(members.find((member) => member.id === form.memberId) || {})
      : form.customerName.trim();

    if (!form.date || !form.reference.trim() || !customerName || !itemDescription || !form.revenueAccount
        || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter the date, sale reference, customer, product or service, whole-number quantity, revenue account, and a positive amount.');
      return;
    }
    if (form.paymentType === 'cash' && !form.paymentMethod) {
      setError('Select the payment method for this cash sale.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        p_sale: {
          transaction_date: form.date,
          reference_number: form.reference.trim(),
          customer_name: customerName,
          member_id: customerMode === 'member' ? form.memberId : null,
          product_id: form.productId || null,
          item_description: itemDescription,
          quantity,
          amount,
          payment_type: form.paymentType,
          payment_method: form.paymentMethod,
          cash_account: form.cashAccount,
          revenue_account: form.revenueAccount
        }
      });
    } catch (saveError) {
      setError(saveError.message || 'The sale could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Sales</h2>
        <p className="mt-1 text-sm text-gray-600">Record sales revenue and later credit collections without recording revenue twice.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="py-8 text-center text-gray-500">Loading sales options…</p> : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">
              Sales action *
              <select
                value={flow}
                onChange={(event) => {
                  const nextFlow = event.target.value;
                  setFlow(nextFlow);
                  setForm((current) => ({
                    ...current,
                    reference: createReference(nextFlow === 'collection' ? 'COLL' : 'SAL'),
                    amount: ''
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="sale">Record a sale</option>
                <option value="collection">Collect against a credit sale</option>
                <option value="cancel">Cancel an unpaid credit sale</option>
              </select>
            </label>
            {flow !== 'cancel' && (
              <>
                <label className="text-sm font-medium text-gray-700">
                  {flow === 'sale' ? 'Sale date *' : 'Collection date *'}
                  <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  {flow === 'sale' ? 'Sale reference / invoice number *' : 'Collection reference *'}
                  <input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <span className="mt-1 block text-xs text-gray-500">
                    {flow === 'sale' && form.paymentType === 'credit'
                      ? 'This identifies the sale record. An official receipt number is issued when payment is collected.'
                      : 'This identifies the sale or collection record. The official receipt number is issued by the server after recording.'}
                  </span>
                </label>
              </>
            )}
            {flow === 'cancel' ? (
              <>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Unpaid credit sale *
                  <select value={cancellationOrderId} onChange={(event) => setCancellationOrderId(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <option value="">Select an unpaid credit sale</option>
                    {cancellableSales.map((sale) => (
                      <option key={sale.id} value={sale.id}>{sale.order_number} — {sale.customer_name}</option>
                    ))}
                  </select>
                  {cancellableSales.length === 0 && <span className="mt-1 block text-xs text-gray-500">No unpaid credit sales are currently eligible. Any collection receipt must be voided separately first.</span>}
                </label>
                {cancellableSales.find((sale) => sale.id === cancellationOrderId)?.returnableItems.map((item) => (
                  <label key={item.product_id} className="text-sm font-medium text-gray-700">
                    Returned quantity — {item.description}
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      {item.remaining} unit(s) remain eligible for return ({item.returned} already returned).
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={item.remaining}
                      step="1"
                      value={returnQuantities[item.product_id] || '0'}
                      onChange={(event) => setReturnQuantities({ ...returnQuantities, [item.product_id]: event.target.value })}
                      disabled={item.remaining === 0}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                ))}
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Cancellation reason *
                  <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <span className="mt-1 block text-xs font-normal text-gray-500">Any collected receipts must be voided or refunded separately. Enter only quantities physically returned; other stock will not be restored.</span>
                </label>
              </>
            ) : flow === 'collection' ? (
              <>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Outstanding credit sale *
                  <select value={collectionOrderId} onChange={(event) => setCollectionOrderId(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <option value="">Select a credit sale</option>
                    {outstandingSales.map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        {sale.order_number} — {sale.customer_name} — due ₱{(Number(sale.net_amount) - Number(sale.amount_paid || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                  {outstandingSales.length === 0 && <span className="mt-1 block text-xs text-gray-500">There are no outstanding credit sales.</span>}
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Collection amount (₱) *
                  <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700">
                    Payment method *
                    <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                      <option value="cash">Cash</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Deposit to *
                    <select value={form.cashAccount} onChange={(event) => setForm({ ...form, cashAccount: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                      <option value="Cash on Hand">Cash on Hand</option><option value="Cash in Bank">Cash in Bank</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
            <label className="text-sm font-medium text-gray-700">
              Customer *
              <select
                value={customerMode === 'member' ? form.memberId : customerMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'other') {
                    setCustomerMode('other');
                    setForm({ ...form, memberId: '' });
                  } else {
                    setCustomerMode('member');
                    setForm({ ...form, memberId: value, customerName: '' });
                  }
                }}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="other">Non-member customer</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{getMemberName(member)}{member.member_number ? ` (${member.member_number})` : ''}</option>
                ))}
              </select>
              {customerMode === 'other' && (
                <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer name" required className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" />
              )}
            </label>
            <label className="text-sm font-medium text-gray-700">
              Product (optional) or service
              <select
                value={form.productId}
                onChange={(event) => {
                  const product = products.find((item) => item.id === event.target.value);
                  setForm({ ...form, productId: event.target.value, itemDescription: product?.product_name || '' });
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="">No inventory product / service</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name} ({product.product_code})</option>)}
              </select>
              <input value={form.itemDescription} onChange={(event) => setForm({ ...form, itemDescription: event.target.value })} placeholder="Product or service description *" required className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Quantity *
              <input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Total amount (₱) *
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              <span className="mt-1 block text-xs text-gray-500">Unit amount: ₱{unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Sales revenue account *
              <select value={form.revenueAccount} onChange={(event) => setForm({ ...form, revenueAccount: event.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="">Select revenue account</option>
                {revenueAccounts.map((account) => <option key={account.account_name} value={account.account_name}>{account.account_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Sale terms *
              <select value={form.paymentType} onChange={(event) => setForm({ ...form, paymentType: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="cash">Paid now</option>
                <option value="credit">On credit</option>
              </select>
            </label>
            {form.paymentType === 'cash' && (
              <>
                <label className="text-sm font-medium text-gray-700">
                  Payment method *
                  <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Deposit to *
                  <select value={form.cashAccount} onChange={(event) => setForm({ ...form, cashAccount: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <option value="Cash on Hand">Cash on Hand</option>
                    <option value="Cash in Bank">Cash in Bank</option>
                  </select>
                </label>
              </>
            )}
              </>
            )}
          </div>
          {flow === 'sale' && form.productId && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">If this product has inventory tracked, the system checks available stock and records the sale movement.</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving || loading || (flow === 'sale' && !revenueAccounts.length) || (flow === 'collection' && !outstandingSales.length) || (flow === 'cancel' && (!cancellableSales.length || !navigator.onLine || offlineMode))} className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">{saving ? 'Recording…' : flow === 'sale' ? 'Record Sale' : flow === 'collection' ? 'Record Collection' : 'Cancel Credit Sale'}</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SalesForm;

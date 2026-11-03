import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import offlineDb from '../../../lib/Offline/OfflineDb';
import { getDataLoadErrorMessage } from '../../../lib/errorHandler';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import MemberBalanceSummary from './MemberBalanceSummary';
import SearchableMemberSelect from '../../common/SearchableMemberSelect';

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
  const [collectionPayeeKey, setCollectionPayeeKey] = useState('');
  const [cancellationOrderId, setCancellationOrderId] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [returnQuantities, setReturnQuantities] = useState({});
  const [salesRefresh, setSalesRefresh] = useState(0);
  const refreshSales = useCallback(() => setSalesRefresh((current) => current + 1), []);
  const [form, setForm] = useState({
    date: today(),
    dueDate: '',
    reference: createReference(),
    customerName: '',
    customerContactNumber: '',
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
  useRealtimeSubscription('sales_orders', refreshSales, null, [refreshSales], navigator.onLine && !offlineMode);
  useEffect(() => {
    const refreshWhenOnline = () => {
      if (navigator.onLine && !offlineMode) refreshSales();
    };
    window.addEventListener('online', refreshWhenOnline);
    window.addEventListener('focus', refreshWhenOnline);
    return () => {
      window.removeEventListener('online', refreshWhenOnline);
      window.removeEventListener('focus', refreshWhenOnline);
    };
  }, [offlineMode, refreshSales]);

  const productAvailableQuantity = selectedProduct
    ? (Array.isArray(selectedProduct.stock_inventory)
      ? selectedProduct.stock_inventory
      : selectedProduct.stock_inventory ? [selectedProduct.stock_inventory] : [])
      .reduce((total, inventory) => total + Number(inventory.quantity_available || 0), 0)
    : 0;
  const unitPrice = useMemo(() => {
    if (selectedProduct) return Number(selectedProduct.unit_price) || 0;
    const quantity = Number(form.quantity);
    const amount = Number(form.amount);
    return quantity > 0 && amount > 0 ? amount / quantity : 0;
  }, [form.amount, form.quantity, selectedProduct]);

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
        const firstSale = options.outstandingSales?.[0];
        setCollectionPayeeKey(firstSale
          ? firstSale.member_id
            ? `member:${firstSale.member_id}`
            : `customer:${(firstSale.customer_name || '').trim().toLocaleLowerCase()}`
          : '');
        setError(`${message} Showing the saved options; the server will validate stock, balances, and eligibility when this operation syncs.`);
        setLoading(false);
      };
      if (!navigator.onLine || offlineMode) {
        await loadCachedOptions('You are offline.');
        return;
      }
      const [productResult, memberResult, accountResult, saleResult] = await Promise.all([
        supabase.from('products')
          .select('id, product_name, product_code, unit_of_measure, unit_price, stock_inventory(quantity_available)')
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
          .select('id, order_number, member_id, customer_name, net_amount, amount_paid, payment_status, order_status, cash_receipt_id, sales_order_items(id, product_id, item_description, quantity, unit_price, line_total, product:products(product_name))')
          .in('payment_status', ['pending', 'partial'])
          .or('order_status.is.null,order_status.neq.cancelled')
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
            const current = itemMap.get(item.product_id) || {
              product_id: item.product_id,
              description: item.product?.product_name || item.item_description,
              soldQuantity: 0,
              totalLineAmount: 0,
            };
            const quantity = Number(item.quantity || 0);
            current.soldQuantity += quantity;
            current.totalLineAmount += Number(item.line_total ?? (Number(item.unit_price || 0) * quantity));
            itemMap.set(item.product_id, current);
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
                unitAmount: item.soldQuantity > 0 ? item.totalLineAmount / item.soldQuantity : 0,
              };
            }),
          };
        });
        setProducts(productResult.data || []);
        setMembers(memberResult.data || []);
        setRevenueAccounts(accountResult.data || []);
        const outstandingCreditSales = openSales.filter((sale) =>
          sale.order_status !== 'cancelled'
          && Number(sale.net_amount) - Number(sale.amount_paid || 0) > 0.01
        );
        setOutstandingSales(outstandingCreditSales);
        setCollectionOrderId((current) => outstandingCreditSales.some((sale) => sale.id === current)
          ? current
          : outstandingCreditSales[0]?.id || '');
        const availablePayeeKeys = outstandingCreditSales.map((sale) => sale.member_id
          ? `member:${sale.member_id}`
          : `customer:${(sale.customer_name || '').trim().toLocaleLowerCase()}`);
        const firstPayeeKey = availablePayeeKeys[0] || '';
        setCollectionPayeeKey((current) => availablePayeeKeys.includes(current) ? current : firstPayeeKey);
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
                outstandingSales: outstandingCreditSales,
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
  }, [offlineMode, salesRefresh, user?.id]);

  const getMemberName = (member) => [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');
  const creditPayees = useMemo(() => {
    const payees = new Map();
    for (const sale of outstandingSales) {
      const key = sale.member_id
        ? `member:${sale.member_id}`
        : `customer:${(sale.customer_name || '').trim().toLocaleLowerCase()}`;
      const current = payees.get(key) || { key, saleCount: 0, balance: 0, memberId: sale.member_id || null, name: sale.customer_name || 'Non-member customer' };
      current.saleCount += 1;
      current.balance += Math.max(Number(sale.net_amount || 0) - Number(sale.amount_paid || 0), 0);
      payees.set(key, current);
    }
    return [...payees.values()].map((payee) => {
      const member = members.find((item) => item.id === payee.memberId);
      return {
        ...payee,
        name: member ? getMemberName(member) : payee.name,
        memberNumber: member?.member_number || '',
        label: `${payee.memberId ? 'Member' : 'Non-member'} · ${member ? getMemberName(member) : payee.name}`,
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
  }, [members, outstandingSales]);
  const filteredOutstandingSales = useMemo(() => outstandingSales.filter((sale) => {
    const key = sale.member_id
      ? `member:${sale.member_id}`
      : `customer:${(sale.customer_name || '').trim().toLocaleLowerCase()}`;
    return key === collectionPayeeKey;
  }), [collectionPayeeKey, outstandingSales]);
  const selectedCollectionSale = outstandingSales.find((sale) => sale.id === collectionOrderId);
  const selectedCancellationSale = cancellableSales.find((sale) => sale.id === cancellationOrderId);
  const selectedCancellationReturnValue = useMemo(() => {
    const items = selectedCancellationSale?.returnableItems || [];
    return Math.round(items.reduce((total, item) => {
      const quantity = Number(returnQuantities[item.product_id] || 0);
      return total + Math.round(quantity * Number(item.unitAmount || 0) * 100) / 100;
    }, 0) * 100) / 100;
  }, [returnQuantities, selectedCancellationSale]);
  const selectedCollectionBalance = selectedCollectionSale
    ? Math.max(Number(selectedCollectionSale.net_amount || 0) - Number(selectedCollectionSale.amount_paid || 0), 0)
    : 0;
  const isOffline = !navigator.onLine || offlineMode;
  const collectionAmount = Number(form.amount);
  const collectionExceedsBalance = flow === 'collection'
    && Boolean(form.amount)
    && Number.isFinite(collectionAmount)
    && collectionAmount > selectedCollectionBalance;
  const selectedBalanceMemberId = flow === 'collection'
    ? collectionPayeeKey.startsWith('member:') ? collectionPayeeKey.slice('member:'.length) : ''
    : customerMode === 'member' ? form.memberId : '';
  const selectCollectionSale = (saleId) => {
    setCollectionOrderId(saleId);
    const sale = outstandingSales.find((item) => item.id === saleId);
    const remaining = sale ? Math.max(Number(sale.net_amount || 0) - Number(sale.amount_paid || 0), 0) : 0;
    setForm((current) => ({ ...current, amount: remaining ? remaining.toFixed(2) : '' }));
  };

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
      const returnedItemValue = Math.round(returnedItems.reduce((total, item) => {
        const saleItem = sale.returnableItems.find((candidate) => candidate.product_id === item.product_id);
        return total + Math.round(item.quantity * Number(saleItem?.unitAmount || 0) * 100) / 100;
      }, 0) * 100) / 100;
      const workflowAmount = returnedItemValue > 0 ? returnedItemValue : Number(sale.net_amount);
      setSaving(true);
      try {
        await onSave({
          action: 'cancel-credit-sale',
          p_sales_order_id: sale.id,
          p_sales_order_number: sale.order_number,
          p_customer_name: sale.customer_name,
          amount: workflowAmount,
          p_original_sale_amount: Number(sale.net_amount),
          p_returned_item_value: returnedItemValue,
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
      const sale = selectedCollectionSale;
      const outstanding = sale ? Number(sale.net_amount) - Number(sale.amount_paid || 0) : 0;
      if (!isOffline && amount > outstanding) return;
      if (!form.date || !form.reference.trim() || !sale || !Number.isFinite(amount) || amount <= 0) {
        setError('Select an outstanding credit sale and enter a collection amount greater than zero.');
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
    const customerContactNumber = customerMode === 'member' ? '' : form.customerContactNumber.trim();

    if (!form.date || !form.reference.trim() || !customerName || !itemDescription || !form.revenueAccount
        || (customerMode === 'other' && !customerContactNumber)
        || (form.paymentType === 'credit' && (!form.dueDate || form.dueDate < form.date))
        || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter valid sale and customer details, a positive amount, and a credit-sale due date that is on or after the sale date.');
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
          due_date: form.paymentType === 'credit' ? form.dueDate : null,
          reference_number: form.reference.trim(),
          customer_name: customerName,
          customer_contact_number: customerContactNumber || null,
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
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShoppingCart size={21} strokeWidth={2.2} aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">Sales · cash received only when paid</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Sales</h2>
            <p className="mt-1 text-sm text-slate-600">Record a sale, collect a credit balance, or cancel an unpaid credit sale. A credit sale records an amount due, not money received.</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to transaction types
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="py-8 text-center text-gray-500">Loading sales options…</p> : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="mb-4 border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Sale details</h3>
              <p className="mt-0.5 text-xs text-slate-500">Choose the sales action and enter the related customer and transaction information.</p>
            </div>
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
                  {flow === 'sale' ? 'Sale reference *' : 'Collection reference *'}
                  <input value={form.reference} readOnly required className="mt-1 w-full rounded-lg border border-gray-300 bg-slate-50 px-3 py-2 text-slate-700" />
                  <span className="mt-1 block text-xs text-gray-500">
                    {flow === 'sale' && form.paymentType === 'credit'
                      ? 'Generated automatically to identify the sale. An official receipt number is issued when payment is collected.'
                      : 'Generated automatically to identify the sale or collection. The official receipt number is issued by the server after recording.'}
                  </span>
                </label>
              </>
            )}
            {flow === 'cancel' ? (
              <>
                <section className="sm:col-span-2 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                  <div className="mb-3">
                    <h4 className="font-semibold text-slate-900">1. Choose the credit sale to cancel</h4>
                    <p className="mt-1 text-xs text-slate-600">This sale number is the shared reference used in the Manager review, audit trail, and inventory reversal.</p>
                  </div>
                  <label className="block text-sm font-medium text-gray-700">
                    Unpaid credit sale *
                    <select value={cancellationOrderId} onChange={(event) => {
                      setCancellationOrderId(event.target.value);
                      setReturnQuantities({});
                    }} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                      <option value="">Select an unpaid credit sale</option>
                      {cancellableSales.map((sale) => (
                        <option key={sale.id} value={sale.id}>{sale.order_number} — {sale.customer_name}</option>
                      ))}
                    </select>
                    {cancellableSales.length === 0 && <span className="mt-1 block text-xs text-gray-600">No unpaid credit sales are eligible. Any collection receipt must be voided separately first.</span>}
                  </label>
                  {selectedCancellationSale && (
                    <dl className="mt-3 grid gap-2 rounded-lg border border-orange-100 bg-white p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="text-xs font-medium text-slate-500">Sale reference</dt><dd className="mt-0.5 font-semibold text-slate-900">{selectedCancellationSale.order_number}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Customer</dt><dd className="mt-0.5 font-semibold text-slate-900">{selectedCancellationSale.customer_name || 'Customer not recorded'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500">Sale total</dt><dd className="mt-0.5 font-semibold text-slate-900">₱{Number(selectedCancellationSale.net_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
                      <div><dt className="text-xs font-medium text-orange-800">Value of items being returned</dt><dd className="mt-0.5 font-bold text-orange-950">₱{selectedCancellationReturnValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
                    </dl>
                  )}
                  {selectedCancellationSale?.returnableItems.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2">
                        <h5 className="text-sm font-semibold text-slate-900">2. Enter physical quantities being returned</h5>
                        <p className="mt-0.5 text-xs text-slate-600">Only these quantities will be restored to inventory. Leave zero for items not physically returned.</p>
                      </div>
                      <div className="space-y-2">
                        {selectedCancellationSale.returnableItems.map((item) => (
                          <label key={item.product_id} className="grid items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-[minmax(0,1fr)_8rem]">
                            <span>
                              <span className="block font-semibold text-slate-800">{item.description}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">Remaining eligible: {item.remaining} · Already returned: {item.returned}</span>
                            </span>
                            <span>
                              <span className="mb-1 block text-xs font-medium text-slate-600">Return quantity</span>
                              <input
                                type="number"
                                min="0"
                                max={item.remaining}
                                step="1"
                                value={returnQuantities[item.product_id] || '0'}
                                onChange={(event) => {
                                  const value = event.target.value.replace(/^0+(?=\d)/, '');
                                  setReturnQuantities((current) => ({ ...current, [item.product_id]: value }));
                                }}
                                disabled={item.remaining === 0}
                                aria-label={`Return quantity for ${item.description}`}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-600/20 disabled:bg-slate-100"
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  3. Cancellation reason *
                  <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} required placeholder="Explain why this credit sale should be cancelled. This reason will be shown to the Manager and retained in the audit history." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-600/20" />
                  <span className="mt-1 block text-xs font-normal text-gray-500">Any collected receipts must be voided or refunded separately. The Manager will review the selected sale, reason, and returned quantities.</span>
                </label>
              </>
            ) : flow === 'collection' ? (
              <>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Member / non-member with payable sales *
                  <SearchableMemberSelect
                    id="sales-collection-payee"
                    options={creditPayees.map((payee) => ({
                      value: payee.key,
                      label: `${payee.name}${payee.memberNumber ? ` (${payee.memberNumber})` : ''} · ${payee.saleCount} credit sale(s) · ₱${payee.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                      searchText: `${payee.label} ${payee.memberNumber}`
                    }))}
                    value={collectionPayeeKey}
                    onChange={(payeeKey) => {
                      setCollectionPayeeKey(payeeKey);
                      const firstSale = outstandingSales.find((sale) => {
                        const key = sale.member_id
                          ? `member:${sale.member_id}`
                          : `customer:${(sale.customer_name || '').trim().toLocaleLowerCase()}`;
                        return key === payeeKey;
                      });
                      selectCollectionSale(firstSale?.id || '');
                    }}
                    required
                    placeholder="Search members/payees by name"
                    className="mt-1"
                  />
                  {creditPayees.length === 0 && <span className="mt-1 block text-xs text-gray-500">Only members/payees with an outstanding credit sale are listed.</span>}
                </label>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Outstanding credit sale *
                  <select value={collectionOrderId} onChange={(event) => selectCollectionSale(event.target.value)} required disabled={!filteredOutstandingSales.length} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-slate-100">
                    <option value="">Select a credit sale</option>
                    {filteredOutstandingSales.map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        {sale.order_number} — {sale.customer_name} — due ₱{(Number(sale.net_amount) - Number(sale.amount_paid || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                  {!filteredOutstandingSales.length && <span className="mt-1 block text-xs text-gray-500">Select a member/payee with an outstanding credit sale.</span>}
                </label>
                <MemberBalanceSummary memberId={selectedBalanceMemberId} className="sm:col-span-2" />
                <label className="text-sm font-medium text-gray-700">
                  Collection amount (₱) *
                  <input
                    type="number"
                    min="0.01"
                    max={!isOffline && selectedCollectionSale ? selectedCollectionBalance : undefined}
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                    aria-invalid={collectionExceedsBalance}
                    aria-describedby="sales-collection-amount-help"
                    required
                    className={`mt-1 w-full rounded-lg border px-3 py-2 ${collectionExceedsBalance ? 'border-red-500 bg-red-50 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-200' : 'border-gray-300'}`}
                  />
                  <span id="sales-collection-amount-help" role={collectionExceedsBalance ? 'alert' : undefined} className={`mt-1 block text-xs ${collectionExceedsBalance ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                    {collectionExceedsBalance
                      ? `Collection exceeds the remaining credit balance of ₱${selectedCollectionBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                      : selectedCollectionSale
                        ? `Maximum collection: ₱${selectedCollectionBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                        : 'Select an outstanding credit sale to see its remaining balance.'}
                  </span>
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
              <SearchableMemberSelect
                id="sales-customer-member"
                members={members}
                extraOptions={[{ value: 'other', label: 'Non-member customer' }]}
                value={customerMode === 'member' ? form.memberId : customerMode}
                onChange={(value) => {
                  if (value === 'other') {
                    setCustomerMode('other');
                    setForm({ ...form, memberId: '' });
                  } else {
                    setCustomerMode('member');
                    setForm({ ...form, memberId: value, customerName: '' });
                  }
                }}
                required
                placeholder="Search members by name or number"
                className="mt-1"
              />
              {customerMode === 'other' && (
                <>
                  <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer name" required className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.customerContactNumber}
                    onChange={(event) => setForm((current) => ({ ...current, customerContactNumber: event.target.value }))}
                    placeholder="Contact number"
                    aria-label="Non-member customer contact number"
                    maxLength={24}
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </>
              )}
            </label>
            <MemberBalanceSummary memberId={selectedBalanceMemberId} className="sm:col-span-2" />

            <label className="text-sm font-medium text-gray-700">
              Product (optional) or service
              <select
                value={form.productId}
                onChange={(event) => {
                  const product = products.find((item) => item.id === event.target.value);
                  const availableQuantity = product
                    ? (Array.isArray(product.stock_inventory)
                      ? product.stock_inventory
                      : product.stock_inventory ? [product.stock_inventory] : [])
                      .reduce((total, inventory) => total + Number(inventory.quantity_available || 0), 0)
                    : 1;
                  const quantity = product ? availableQuantity : 1;
                  const amount = product
                    ? (Math.round((Number(product.unit_price) || 0) * quantity * 100) / 100).toFixed(2)
                    : '';
                  setForm((current) => ({
                    ...current,
                    productId: event.target.value,
                    itemDescription: product?.product_name || '',
                    quantity: String(quantity),
                    amount
                  }));
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
              <input
                type="number"
                min="1"
                max={selectedProduct ? productAvailableQuantity : undefined}
                step="1"
                value={form.quantity}
                onChange={(event) => {
                  const quantity = event.target.value;
                  const amount = selectedProduct && Number.isInteger(Number(quantity)) && Number(quantity) > 0
                    ? (Math.round(Number(selectedProduct.unit_price) * Number(quantity) * 100) / 100).toFixed(2)
                    : selectedProduct ? '' : form.amount;
                  setForm((current) => ({ ...current, quantity, amount }));
                }}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
              {selectedProduct && <span className="mt-1 block text-xs text-gray-500">Available quantity: {productAvailableQuantity}</span>}
            </label>
            <label className="text-sm font-medium text-gray-700">
              Total amount (₱) *
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                readOnly={Boolean(selectedProduct)}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 read-only:bg-gray-50"
              />
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
              Payment status *
              <select value={form.paymentType} onChange={(event) => setForm({ ...form, paymentType: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="cash">Money received</option>
                <option value="credit">Amount due</option>
              </select>
              {form.paymentType === 'credit' && (
                <span className="mt-1 block text-xs text-gray-600">
                  This records a receivable, not a cash receipt. Use “Collect against a credit sale” when payment is received.
                </span>
              )}
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
            {form.paymentType === 'credit' && (
              <label className="text-sm font-medium text-gray-700">
                Due date *
                <input
                  type="date"
                  min={form.date}
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                />
                <span className="mt-1 block text-xs font-normal text-gray-500">The amount due will be aged from this date.</span>
              </label>
            )}
              </>
            )}
          </div>
          </section>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to transaction types
            </button>
            <button type="submit" disabled={saving || loading || (flow === 'sale' && !revenueAccounts.length) || (flow === 'collection' && !outstandingSales.length) || (flow === 'cancel' && (!cancellableSales.length || !navigator.onLine || offlineMode))} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60">{saving ? 'Recording…' : flow === 'sale' ? 'Record Sale' : flow === 'collection' ? 'Record Collection' : 'Cancel Credit Sale'}</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SalesForm;

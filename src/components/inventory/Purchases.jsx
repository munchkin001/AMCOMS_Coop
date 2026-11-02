import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cancelPurchase, receivePurchase } from '../../lib/inventoryService';
import NewPurchaseModal from './NewPurchaseModal';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  ordered: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const PAYMENT_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  partial: 'bg-orange-100 text-orange-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800'
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const label = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

const Badge = ({ value, styles }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[value] || 'bg-gray-100 text-gray-700'}`}>
    {label(value)}
  </span>
);

const Purchases = () => {
  const { offlineMode, user, staff } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const requestId = useRef(0);


  const fetchPurchases = useCallback(async () => {
    const currentRequest = ++requestId.current;
    let query = supabase
      .from('purchases')
      .select(`
        id, purchase_number, purchase_date, expected_delivery_date, net_amount,
        payment_status, status, notes,
        suppliers(supplier_name),
        purchase_items(id, item_name, unit, quantity, unit_cost, line_total, received_quantity, products(product_name, unit_of_measure))
      `)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (dateFrom) query = query.gte('purchase_date', dateFrom);
    if (dateTo) query = query.lte('purchase_date', dateTo);

    const { data, error: loadError } = await query;
    if (currentRequest !== requestId.current) return;

    if (loadError) {
      setError(getDataLoadErrorMessage(loadError, 'purchases'));
    } else {
      setPurchases(data || []);
      setError('');
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchPurchases();
    return () => {
      requestId.current += 1;
    };
  }, [fetchPurchases]);

  useMultipleRealtimeSubscriptions(
    ['purchases', 'purchase_items', 'suppliers', 'products'].map((table) => ({ table, onUpdate: fetchPurchases })),
    [fetchPurchases]
  );

  const runAction = async (purchase, action, message) => {
    setBusyId(purchase.id);
    setError('');
    setNotice('');
    try {
      const result = await action(purchase.id, { offlineMode, user, staff, purchase });
      setNotice(result?.pendingSync
        ? 'Purchase approval request saved on this device only. It will not be recorded until the server validates it and the Manager approves it.'
        : result?.pendingApproval
          ? 'Purchase request submitted for Manager approval. The purchase record has not been created yet.'
          : message);
      fetchPurchases();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (statusFilter !== 'all' && purchase.status !== statusFilter) return false;
      if (!term) return true;
      const supplier = purchase.suppliers?.supplier_name || '';
      return purchase.purchase_number.toLowerCase().includes(term) || supplier.toLowerCase().includes(term);
    });
  }, [purchases, search, statusFilter]);

  const summary = useMemo(() => {
    const active = purchases.filter((purchase) => purchase.status !== 'cancelled');
    return {
      total: active.reduce((sum, purchase) => sum + Number(purchase.net_amount || 0), 0),
      open: purchases.filter((purchase) => ['draft', 'ordered'].includes(purchase.status)).length,
      received: purchases.filter((purchase) => purchase.status === 'received').length,
      unpaid: purchases
        .filter((purchase) => purchase.status !== 'cancelled' && purchase.payment_status !== 'paid')
        .reduce((sum, purchase) => sum + Number(purchase.net_amount || 0), 0)
    };
  }, [purchases]);

  const toggle = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const summaryCards = [
    { name: 'Total Purchases', value: loading ? '…' : formatMoney(summary.total) },
    { name: 'Open Orders', value: loading ? '…' : summary.open.toLocaleString() },
    { name: 'Received Orders', value: loading ? '…' : summary.received.toLocaleString() },
    { name: 'Unpaid Amount', value: loading ? '…' : formatMoney(summary.unpaid) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setShowForm(true)} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
          New Purchase
        </button>
      </div>
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {showForm && (
        <NewPurchaseModal
          onClose={() => setShowForm(false)}
          onSaved={(result) => {
            setShowForm(false);
            setNotice(result?.pendingSync
              ? 'Purchase approval request saved on this device only. It will not be recorded until the server validates it and the Manager approves it.'
              : 'Purchase order submitted for Manager approval. It will be recorded after Bookkeeper processing.');
            fetchPurchases();
          }}
        />
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.name} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{card.name}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Search & Filter</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="purchase-search" className="mb-1 block text-sm font-medium text-gray-700">Search</label>
            <input
              id="purchase-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number or supplier"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="purchase-status" className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              id="purchase-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="ordered">Ordered</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label htmlFor="purchase-from" className="mb-1 block text-sm font-medium text-gray-700">Date From</label>
            <input
              id="purchase-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="purchase-to" className="mb-1 block text-sm font-medium text-gray-700">Date To</label>
            <input
              id="purchase-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="mt-4 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Reset Filters
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">Purchase Orders</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Order No.</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Payment</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading purchases…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    {purchases.length === 0 ? 'No purchase orders have been recorded yet.' : 'No purchases match the selected filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((purchase) => {
                const isOpen = expanded.has(purchase.id);
                const items = purchase.purchase_items || [];
                return (
                  <React.Fragment key={purchase.id}>
                    <tr className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(purchase.id)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} items for ${purchase.purchase_number}`}
                          className="text-gray-500 hover:text-gray-800"
                        >
                          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{purchase.purchase_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{purchase.purchase_date}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{purchase.suppliers?.supplier_name || 'No supplier'}</td>
                      <td className="px-4 py-3"><Badge value={purchase.status} styles={STATUS_STYLES} /></td>
                      <td className="px-4 py-3"><Badge value={purchase.payment_status} styles={PAYMENT_STYLES} /></td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatMoney(purchase.net_amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {['draft', 'ordered'].includes(purchase.status) && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={busyId === purchase.id}
                              onClick={() => runAction(purchase, receivePurchase, `${purchase.purchase_number} marked as received.`)}
                              className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                            >
                              Mark Received
                            </button>
                            <button
                              type="button"
                              disabled={busyId === purchase.id}
                              onClick={() => {
                                if (window.confirm(`Cancel purchase ${purchase.purchase_number}?`)) {
                                  runAction(purchase, cancelPurchase, `${purchase.purchase_number} cancelled.`);
                                }
                              }}
                              className="rounded-lg bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50">
                        <td />
                        <td colSpan={7} className="px-4 py-4">
                          {purchase.expected_delivery_date && (
                            <p className="mb-2 text-xs text-gray-500">Expected delivery: {purchase.expected_delivery_date}</p>
                          )}
                          {purchase.notes && <p className="mb-3 text-sm text-gray-700">{purchase.notes}</p>}
                          {items.length === 0 ? (
                            <p className="text-sm text-gray-500">No items on this order.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase text-gray-500">
                                  <th className="py-1 pr-4">Item / Material</th>
                                  <th className="py-1 pr-4 text-right">Ordered</th>
                                  <th className="py-1 pr-4 text-right">Received</th>
                                  <th className="py-1 pr-4 text-right">Unit Cost</th>
                                  <th className="py-1 text-right">Line Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-200">
                                    <td className="py-2 pr-4 text-gray-900">{item.item_name || item.products?.product_name || 'Unnamed item'}</td>
                                    <td className="py-2 pr-4 text-right">{item.quantity} {item.unit || item.products?.unit_of_measure || ''}</td>
                                    <td className="py-2 pr-4 text-right">{item.received_quantity ?? 0} {item.unit || item.products?.unit_of_measure || ''}</td>
                                    <td className="py-2 pr-4 text-right">{formatMoney(item.unit_cost)}</td>
                                    <td className="py-2 text-right font-medium">{formatMoney(item.line_total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Purchases;

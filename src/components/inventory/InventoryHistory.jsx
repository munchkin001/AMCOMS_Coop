import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardList, Filter, RotateCcw, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const ACTIVITIES = {
  purchase: { label: 'Purchase', direction: 1, badge: 'bg-green-100 text-green-800' },
  production: { label: 'Production', direction: 1, badge: 'bg-lime-100 text-green-800' },
  return: { label: 'Return', direction: 1, badge: 'bg-green-100 text-green-800' },
  sale: { label: 'Sale', direction: -1, badge: 'bg-rose-100 text-rose-800' },
  transfer: { label: 'Transfer', direction: -1, badge: 'bg-rose-100 text-rose-800' },
  waste: { label: 'Waste', direction: -1, badge: 'bg-red-100 text-red-800' },
  adjustment: { label: 'Adjustment', direction: 0, badge: 'bg-gray-100 text-gray-800' }
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY_FILTERS = { product: '', activity: '', dateFrom: '', dateTo: '' };
const MOVEMENT_FIELDS = 'id, product_id, movement_type, quantity, unit_cost, reference_number, movement_date, description, created_at, products(product_name, unit_of_measure)';
const VALUED_MOVEMENT_FIELDS = 'id, product_id, movement_type, quantity, unit_cost, total_cost, reference_number, movement_date, description, created_at, products(product_name, unit_of_measure)';

const signedQuantity = (movement) => {
  const quantity = Number(movement.quantity || 0);
  const direction = ACTIVITIES[movement.movement_type]?.direction;
  if (direction === 0 || direction === undefined) return quantity;
  return direction * Math.abs(quantity);
};

const formatQuantity = (value, unit) => {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString()}${unit ? ` ${unit}` : ''}`;
};

const isMissingTotalCostColumn = (error) => {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('total_cost')
    && message.includes('stock_movements')
    && (message.includes('does not exist') || message.includes('schema cache'));
};

const InventoryHistory = () => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasTotalCostColumn, setHasTotalCostColumn] = useState(true);
  const requestId = useRef(0);

  const fetchData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const loadMovements = async (fields) => {
      let query = supabase
        .from('stock_movements')
        .select(fields)
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters.product) query = query.eq('product_id', filters.product);
      if (filters.activity) query = query.eq('movement_type', filters.activity);
      if (filters.dateFrom) query = query.gte('movement_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('movement_date', filters.dateTo);

      return query;
    };

    let [movementResult, productResult] = await Promise.all([
      loadMovements(VALUED_MOVEMENT_FIELDS),
      supabase.from('products').select('id, product_name').order('product_name')
    ]);
    const hasCostColumn = !isMissingTotalCostColumn(movementResult.error);
    if (!hasCostColumn) {
      movementResult = await loadMovements(MOVEMENT_FIELDS);
    }
    if (currentRequest !== requestId.current) return;

    const failure = movementResult.error || productResult.error;
    if (failure) {
      setError(getDataLoadErrorMessage(failure, 'inventory history'));
    } else {
      setMovements(movementResult.data || []);
      setProducts(productResult.data || []);
      setHasTotalCostColumn(hasCostColumn);
      setError('');
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
    return () => {
      requestId.current += 1;
    };
  }, [fetchData]);

  useMultipleRealtimeSubscriptions(
    ['stock_movements', 'products', 'production_records', 'purchases'].map((table) => ({ table, onUpdate: fetchData })),
    [fetchData]
  );

  const totals = useMemo(() => movements.reduce((acc, movement) => {
    const value = signedQuantity(movement);
    if (value > 0) acc.in += value;
    else acc.out += Math.abs(value);
    return acc;
  }, { in: 0, out: 0 }), [movements]);

  const updateFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));

  const inputClass = 'inventory-history-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm transition focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-semibold text-slate-700';
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="inventory-history-page mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime-100 text-lime-800 shadow-sm ring-1 ring-lime-200">
            <Warehouse aria-hidden="true" size={24} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-800">Inventory operations</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Inventory Tracking</h1>
            <p className="mt-1 text-sm text-slate-600">Review stock movement, quantities, and FIFO valuation.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lime-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm">
          <ClipboardList aria-hidden="true" className="size-4 text-lime-700" />
          <span>{loading ? 'Updating history…' : `${movements.length} movements shown`}</span>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {!hasTotalCostColumn && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Stock movement history is available, but movement costs are hidden until the inventory costing database migration is applied.
        </p>
      )}

      <section className="rounded-2xl border border-lime-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(63,98,18,0.07)] sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lime-100 text-green-800">
              <Filter aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Filter movements</h2>
              <p className="text-sm text-slate-500">Narrow results by product, activity, or date range.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={!hasActiveFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-lime-300 hover:bg-lime-50 hover:text-green-900 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw aria-hidden="true" size={15} />
            Reset filters
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="tracking-product" className={labelClass}>Product</label>
            <select id="tracking-product" value={filters.product} onChange={updateFilter('product')} className={inputClass}>
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.product_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tracking-activity" className={labelClass}>Activity</label>
            <select id="tracking-activity" value={filters.activity} onChange={updateFilter('activity')} className={inputClass}>
              <option value="">All activities</option>
              {Object.entries(ACTIVITIES).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tracking-from" className={labelClass}>Date from</label>
            <input id="tracking-from" type="date" value={filters.dateFrom} onChange={updateFilter('dateFrom')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="tracking-to" className={labelClass}>Date to</label>
            <input id="tracking-to" type="date" value={filters.dateTo} onChange={updateFilter('dateTo')} className={inputClass} />
          </div>
        </div>
        {hasActiveFilters && (
          <p className="mt-4 text-xs font-medium text-green-800">
            Filters active{filters.product ? ' · Product' : ''}{filters.activity ? ' · Activity' : ''}{filters.dateFrom ? ' · Start date' : ''}{filters.dateTo ? ' · End date' : ''}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="inventory-history-metric rounded-2xl border border-lime-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Movements shown</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">{loading ? '…' : movements.length.toLocaleString()}</p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-lime-50 text-lime-800"><ClipboardList aria-hidden="true" size={21} /></span>
          </div>
        </article>
        <article className="inventory-history-metric rounded-2xl border border-green-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Total stock in</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-green-700">{loading ? '…' : `+${totals.in.toLocaleString()}`}</p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-green-50 text-green-700"><ArrowDownToLine aria-hidden="true" size={21} /></span>
          </div>
        </article>
        <article className="inventory-history-metric rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Total stock out</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-rose-700">{loading ? '…' : `-${totals.out.toLocaleString()}`}</p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-700"><ArrowUpFromLine aria-hidden="true" size={21} /></span>
          </div>
        </article>
      </div>

      <section className="overflow-hidden rounded-2xl border border-lime-200/80 bg-white shadow-[0_12px_36px_rgba(63,98,18,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lime-100 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lime-100 text-green-800"><Warehouse aria-hidden="true" size={20} /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Inventory Movement History</h2>
              <p className="text-sm text-slate-500">Stock ledger entries, references, and FIFO costs</p>
            </div>
          </div>
          <span className="rounded-full bg-lime-50 px-3 py-1 text-xs font-semibold text-green-800 ring-1 ring-lime-200">{loading ? 'Loading' : `${movements.length} entries`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Product</th>
                <th className="text-left">Activity</th>
                <th className="text-left">Reference</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">FIFO cost</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">Loading stock movements…</td></tr>
              )}
              {!loading && movements.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">No stock movements found for the selected filters.</td></tr>
              )}
              {movements.map((movement) => {
                const activity = ACTIVITIES[movement.movement_type];
                const value = signedQuantity(movement);
                return (
                  <tr key={movement.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap text-sm text-slate-600">{movement.movement_date}</td>
                    <td className="text-sm font-semibold text-slate-900">{movement.products?.product_name || 'Unknown product'}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${activity?.badge || 'bg-gray-100 text-gray-800'}`}>
                        {activity?.label || movement.movement_type}
                      </span>
                    </td>
                    <td className="max-w-xs truncate text-sm text-slate-600" title={movement.reference_number || movement.description || ''}>{movement.reference_number || movement.description || '—'}</td>
                    <td className={`whitespace-nowrap text-right text-sm font-bold ${value > 0 ? 'text-green-700' : value < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                      {formatQuantity(value, movement.products?.unit_of_measure)}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm font-semibold text-slate-800">
                      {movement.total_cost == null ? (movement.quantity === 0 ? 'Opening valuation' : '—') : formatMoney(movement.total_cost)}
                      {movement.unit_cost != null && <span className="mt-0.5 block text-xs font-normal text-slate-500">{formatMoney(movement.unit_cost)} / unit</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default InventoryHistory;

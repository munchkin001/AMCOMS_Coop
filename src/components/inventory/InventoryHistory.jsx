import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const ACTIVITIES = {
  purchase: { label: 'Purchase', direction: 1, badge: 'bg-green-100 text-green-800' },
  production: { label: 'Production', direction: 1, badge: 'bg-blue-100 text-blue-800' },
  return: { label: 'Return', direction: 1, badge: 'bg-green-100 text-green-800' },
  sale: { label: 'Sale', direction: -1, badge: 'bg-orange-100 text-orange-800' },
  transfer: { label: 'Transfer', direction: -1, badge: 'bg-orange-100 text-orange-800' },
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

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-2';

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {!hasTotalCostColumn && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Stock movement history is available, but movement costs are hidden until the inventory costing database migration is applied.
        </p>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Search & Filter</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="tracking-product" className={labelClass}>Product</label>
            <select id="tracking-product" value={filters.product} onChange={updateFilter('product')} className={inputClass}>
              <option value="">All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.product_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tracking-activity" className={labelClass}>Activity</label>
            <select id="tracking-activity" value={filters.activity} onChange={updateFilter('activity')} className={inputClass}>
              <option value="">All Activities</option>
              {Object.entries(ACTIVITIES).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tracking-from" className={labelClass}>Date From</label>
            <input id="tracking-from" type="date" value={filters.dateFrom} onChange={updateFilter('dateFrom')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="tracking-to" className={labelClass}>Date To</label>
            <input id="tracking-to" type="date" value={filters.dateTo} onChange={updateFilter('dateTo')} className={inputClass} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
        >
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Movements Shown</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{loading ? '…' : movements.length.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Stock In</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{loading ? '…' : `+${totals.in.toLocaleString()}`}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Stock Out</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{loading ? '…' : `-${totals.out.toLocaleString()}`}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Inventory Movement History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Product</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Activity</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Reference</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">Quantity</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">FIFO Cost</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-500">Loading stock movements…</td></tr>
              )}
              {!loading && movements.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-500">No stock movements found.</td></tr>
              )}
              {movements.map((movement) => {
                const activity = ACTIVITIES[movement.movement_type];
                const value = signedQuantity(movement);
                return (
                  <tr key={movement.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-6 text-sm text-gray-900">{movement.movement_date}</td>
                    <td className="py-3 px-6 text-sm text-gray-900 font-medium">{movement.products?.product_name || 'Unknown product'}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${activity?.badge || 'bg-gray-100 text-gray-800'}`}>
                        {activity?.label || movement.movement_type}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-sm text-gray-600">{movement.reference_number || movement.description || '-'}</td>
                    <td className={`py-3 px-6 text-sm text-right font-semibold ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatQuantity(value, movement.products?.unit_of_measure)}
                    </td>
                    <td className="py-3 px-6 text-right text-sm text-gray-700">
                      {movement.total_cost == null ? (movement.quantity === 0 ? 'Opening valuation' : '—') : formatMoney(movement.total_cost)}
                      {movement.unit_cost != null && <span className="block text-xs text-gray-500">{formatMoney(movement.unit_cost)} / unit</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryHistory;

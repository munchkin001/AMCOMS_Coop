import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { downloadCsv, getQuantityOnHand, getStockStatus } from '../../lib/inventoryService';

const REPORT_TYPES = {
  'stock-report': 'Inventory Stock Report',
  'production-report': 'Production Report',
  'stock-movement': 'Stock Movement Report',
  'damaged-expired': 'Damaged/Expired Products Report'
};

const MOVEMENT_LABELS = {
  purchase: 'Purchase',
  production: 'Production',
  return: 'Return',
  sale: 'Sale',
  transfer: 'Transfer',
  waste: 'Waste',
  adjustment: 'Adjustment'
};

const STATUS_STYLES = {
  Good: 'bg-green-100 text-green-800',
  Low: 'bg-amber-100 text-amber-800',
  'Out of Stock': 'bg-red-100 text-red-800'
};

const pad = (value) => String(value).padStart(2, '0');
const lastDay = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const getRange = (period, anchor) => {
  if (period === 'daily') {
    return { from: anchor, to: anchor, label: new Date(`${anchor}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) };
  }
  if (period === 'annual') {
    const year = Number(anchor.slice(0, 4));
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  }
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  if (period === 'quarterly') {
    const start = Math.floor(month / 3) * 3;
    return {
      from: `${year}-${pad(start + 1)}-01`,
      to: `${year}-${pad(start + 3)}-${pad(lastDay(year, start + 2))}`,
      label: `Q${start / 3 + 1} ${year}`
    };
  }
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay(year, month))}`,
    label: new Date(year, month, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  };
};

const signed = (movement) => {
  const quantity = Number(movement.quantity || 0);
  if (movement.movement_type === 'adjustment') return quantity;
  return ['purchase', 'production', 'return'].includes(movement.movement_type) ? Math.abs(quantity) : -Math.abs(quantity);
};

const InventoryReports = () => {
  const { staff } = useAuth();
  const [reportType, setReportType] = useState('stock-report');
  const [period, setPeriod] = useState('monthly');
  const [anchor, setAnchor] = useState(() => toDateString(new Date()));
  const [products, setProducts] = useState([]);
  const [production, setProduction] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

  const fetchReport = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const [productResult, productionResult, movementResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, product_code, product_name, unit_of_measure, reorder_level, cost_price, stock_inventory(quantity_on_hand)')
        .eq('is_active', true)
        .order('product_name'),
      supabase
        .from('production_records')
        .select('id, production_date, quantity_produced, batch_number, production_number, notes, products(product_name, unit_of_measure)')
        .gte('production_date', range.from).lte('production_date', range.to)
        .order('production_date'),
      supabase
        .from('stock_movements')
        .select('id, movement_date, movement_type, quantity, reference_number, description, products(product_name, unit_of_measure)')
        .gte('movement_date', range.from).lte('movement_date', range.to)
        .order('movement_date')
    ]);
    if (currentRequest !== requestId.current) return;

    const failure = productResult.error || productionResult.error || movementResult.error;
    if (failure) setError(`Unable to load report data: ${failure.message}`);
    else {
      setProducts(productResult.data || []);
      setProduction(productionResult.data || []);
      setMovements(movementResult.data || []);
      setError('');
    }
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => {
    fetchReport();
    return () => {
      requestId.current += 1;
    };
  }, [fetchReport]);

  useMultipleRealtimeSubscriptions(
    ['products', 'stock_inventory', 'stock_movements', 'production_records'].map((table) => ({ table, onUpdate: fetchReport })),
    [fetchReport]
  );

  const wasteMovements = useMemo(() => movements.filter((movement) => movement.movement_type === 'waste'), [movements]);

  const tables = {
    'stock-report': {
      headers: ['Product', 'Current Stock', 'Min Stock', 'Status'],
      rows: products.map((product) => {
        const onHand = getQuantityOnHand(product);
        return [
          product.product_name,
          `${onHand.toLocaleString()} ${product.unit_of_measure}`,
          `${Number(product.reorder_level || 0).toLocaleString()} ${product.unit_of_measure}`,
          getStockStatus(onHand, product.reorder_level)
        ];
      }),
      empty: 'No products have been added yet.'
    },
    'production-report': {
      headers: ['Date', 'Product', 'Quantity', 'Batch / Record No.', 'Notes'],
      rows: production.map((record) => [
        record.production_date,
        record.products?.product_name || 'Unknown product',
        `${Number(record.quantity_produced).toLocaleString()} ${record.products?.unit_of_measure || ''}`.trim(),
        record.batch_number || record.production_number,
        record.notes || ''
      ]),
      empty: 'No production was recorded in this period.'
    },
    'stock-movement': {
      headers: ['Date', 'Product', 'Activity', 'Reference', 'Quantity'],
      rows: movements.map((movement) => {
        const value = signed(movement);
        return [
          movement.movement_date,
          movement.products?.product_name || 'Unknown product',
          MOVEMENT_LABELS[movement.movement_type] || movement.movement_type,
          movement.reference_number || movement.description || '',
          `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toLocaleString()} ${movement.products?.unit_of_measure || ''}`.trim()
        ];
      }),
      empty: 'No stock movements were recorded in this period.'
    },
    'damaged-expired': {
      headers: ['Date', 'Product', 'Quantity', 'Reason'],
      rows: wasteMovements.map((movement) => [
        movement.movement_date,
        movement.products?.product_name || 'Unknown product',
        `${Math.abs(Number(movement.quantity)).toLocaleString()} ${movement.products?.unit_of_measure || ''}`.trim(),
        movement.description || movement.reference_number || ''
      ]),
      empty: 'No damaged, expired or lost products were recorded in this period.'
    }
  };

  const table = tables[reportType];
  const isCurrentStock = reportType === 'stock-report';
  const periodLabel = isCurrentStock ? `As of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : range.label;

  const anchorInput = {
    daily: { type: 'date', value: anchor, onChange: (value) => setAnchor(value) },
    monthly: { type: 'month', value: anchor.slice(0, 7), onChange: (value) => value && setAnchor(`${value}-01`) },
    quarterly: { type: 'month', value: anchor.slice(0, 7), onChange: (value) => value && setAnchor(`${value}-01`) },
    annual: { type: 'number', value: anchor.slice(0, 4), onChange: (value) => value.length === 4 && setAnchor(`${value}-01-01`) }
  }[period];

  const handleDownload = () => {
    downloadCsv(`${reportType}-${isCurrentStock ? toDateString(new Date()) : range.from}.csv`, [table.headers, ...table.rows]);
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-2';

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="bg-white rounded-lg border border-gray-200 p-6 print:hidden">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Options</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="report-type" className={labelClass}>Report Type</label>
            <select id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value)} className={inputClass}>
              {Object.entries(REPORT_TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="report-period" className={labelClass}>Period</label>
            <select id="report-period" value={period} onChange={(event) => setPeriod(event.target.value)} disabled={isCurrentStock} className={`${inputClass} disabled:bg-gray-100`}>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div>
            <label htmlFor="report-anchor" className={labelClass}>
              {{ daily: 'Date', monthly: 'Month', quarterly: 'Month in Quarter', annual: 'Year' }[period]}
            </label>
            <input
              id="report-anchor"
              type={anchorInput.type}
              value={anchorInput.value}
              onChange={(event) => anchorInput.onChange(event.target.value)}
              disabled={isCurrentStock}
              className={`${inputClass} disabled:bg-gray-100`}
            />
          </div>
        </div>
        <div className="flex space-x-3">
          <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium">Print</button>
          <button type="button" onClick={handleDownload} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-60">Download CSV</button>
        </div>
        <p className="mt-3 text-sm text-gray-500">The report updates automatically as inventory changes are recorded.</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">AMCOMS</h2>
          <p className="text-gray-600">AGAY-AYAN MULTI-PURPOSE COOPERATIVE</p>
          <h3 className="text-lg font-semibold text-orange-600 mt-4 uppercase">{REPORT_TYPES[reportType]}</h3>
          <p className="text-sm text-gray-600 mt-1">{periodLabel}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                {table.headers.map((header) => (
                  <th key={header} className="text-left py-3 px-4 font-semibold text-gray-700">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={table.headers.length} className="py-10 text-center text-gray-500">Loading report…</td></tr>}
              {!loading && table.rows.length === 0 && (
                <tr><td colSpan={table.headers.length} className="py-10 text-center text-gray-500">{table.empty}</td></tr>
              )}
              {!loading && table.rows.map((row, index) => (
                <tr key={index} className="border-b">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="py-3 px-4 text-sm text-gray-900">
                      {isCurrentStock && cellIndex === 3
                        ? <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[cell]}`}>{cell}</span>
                        : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Generated on {new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          <p className="mt-1">Prepared by: {staff?.full_name || 'Inventory Staff'}</p>
        </div>
      </div>
    </div>
  );
};

export default InventoryReports;

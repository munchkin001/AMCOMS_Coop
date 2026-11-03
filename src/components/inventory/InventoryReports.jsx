import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { toDateString } from '../../lib/dashboardAccounting';
import { downloadCsv, getQuantityOnHand, getStockStatus } from '../../lib/inventoryService';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import ReportInsights from '../common/ReportInsights';

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
        .select('id, product_code, product_name, unit_of_measure, reorder_level, stock_inventory(quantity_on_hand), inventory_cost_layers(quantity_remaining, unit_cost)')
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
    if (failure) setError(getDataLoadErrorMessage(failure, 'inventory report'));
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
    ['products', 'stock_inventory', 'stock_movements', 'production_records', 'inventory_cost_layers'].map((table) => ({ table, onUpdate: fetchReport })),
    [fetchReport]
  );

  const wasteMovements = useMemo(() => movements.filter((movement) => movement.movement_type === 'waste'), [movements]);

  const tables = {
    'stock-report': {
      headers: ['Product', 'Current Stock', 'FIFO Inventory Value', 'Unvalued Stock', 'Min Stock', 'Status'],
      rows: products.map((product) => {
        const onHand = getQuantityOnHand(product);
        const layers = product.inventory_cost_layers || [];
        const valuedQuantity = layers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0), 0);
        const value = layers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0) * Number(layer.unit_cost || 0), 0);
        return [
          product.product_name,
          `${onHand.toLocaleString()} ${product.unit_of_measure}`,
          `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${Math.max(onHand - valuedQuantity, 0).toLocaleString()} ${product.unit_of_measure}`,
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
  const analysis = useMemo(() => {
    const stockMetrics = products.map((product) => {
      const onHand = getQuantityOnHand(product);
      const layers = product.inventory_cost_layers || [];
      const valuedQuantity = layers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0), 0);
      const value = layers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0) * Number(layer.unit_cost || 0), 0);
      return { product, onHand, valuedQuantity, unvalued: Math.max(onHand - valuedQuantity, 0), value, status: getStockStatus(onHand, product.reorder_level) };
    });
    const totalStockValue = stockMetrics.reduce((sum, row) => sum + row.value, 0);
    const totalUnvalued = stockMetrics.reduce((sum, row) => sum + row.unvalued, 0);
    const lowStock = stockMetrics.filter((row) => row.status === 'Low').length;
    const outOfStock = stockMetrics.filter((row) => row.status === 'Out of Stock').length;
    const producedQuantity = production.reduce((sum, row) => sum + Number(row.quantity_produced || 0), 0);
    const movementGroups = movements.reduce((groups, movement) => {
      const unit = movement.products?.unit_of_measure || 'unit not specified';
      const key = `${MOVEMENT_LABELS[movement.movement_type] || movement.movement_type} · ${unit}`;
      const current = groups[key] || { quantity: 0, records: 0 };
      current.quantity += Math.abs(Number(movement.quantity || 0));
      current.records += 1;
      groups[key] = current;
      return groups;
    }, {});
    const productionGroups = production.reduce((groups, record) => {
      const productName = record.products?.product_name || 'Unspecified product';
      const unit = record.products?.unit_of_measure || 'unit not specified';
      const key = `${productName} · ${unit}`;
      const current = groups[key] || { quantity: 0, batches: 0 };
      current.quantity += Number(record.quantity_produced || 0);
      current.batches += 1;
      groups[key] = current;
      return groups;
    }, {});
    const wasteGroups = wasteMovements.reduce((groups, movement) => {
      const productName = movement.products?.product_name || 'Unspecified product';
      const unit = movement.products?.unit_of_measure || 'unit not specified';
      const key = `${productName} · ${unit}`;
      groups[key] = (groups[key] || 0) + Math.abs(Number(movement.quantity || 0));
      return groups;
    }, {});
    const metrics = [];
    const highlights = [];
    const challenges = [];
    const opportunities = [];
    const breakdowns = [];

    if (reportType === 'stock-report') {
      metrics.push(
        { label: 'Active products', value: stockMetrics.length.toLocaleString() },
        { label: 'Products at / below reorder level', value: lowStock.toLocaleString() },
        { label: 'Out-of-stock products', value: outOfStock.toLocaleString() },
        { label: 'Valued inventory', value: `₱${totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Unvalued stock quantity', value: totalUnvalued.toLocaleString(), detail: 'Quantity; units differ by product' }
      );
      if (stockMetrics.length) highlights.push(`${stockMetrics.length.toLocaleString()} active product records are included in the current stock snapshot.`);
      if (lowStock) challenges.push(`${lowStock.toLocaleString()} product${lowStock === 1 ? '' : 's'} are at or below reorder level.`);
      if (outOfStock) challenges.push(`${outOfStock.toLocaleString()} product${outOfStock === 1 ? '' : 's'} have no available stock.`);
      if (totalUnvalued > 0) challenges.push(`${totalUnvalued.toLocaleString()} units are not covered by remaining FIFO cost layers and are excluded from the valued inventory amount.`);
      if (lowStock + outOfStock > 0) opportunities.push('Review replenishment needs and confirm purchase timing for low or unavailable items.');
      if (totalUnvalued > 0) opportunities.push('Review opening or receipt costing for quantities without FIFO cost layers.');
      breakdowns.push({
        title: 'Current stock status by product',
        labelHeading: 'Product',
        valueHeading: 'On hand',
        detailHeading: 'Status · FIFO value',
        items: stockMetrics.map(({ product, onHand, value, status }) => ({
          label: product.product_name,
          value: `${onHand.toLocaleString()} ${product.unit_of_measure || ''}`.trim(),
          detail: `${status} · ₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }))
      });
    } else if (reportType === 'production-report') {
      metrics.push(
        { label: 'Production records', value: production.length.toLocaleString() },
        { label: 'Total output recorded', value: producedQuantity.toLocaleString(), detail: 'Aggregate quantity; units differ by product' },
        { label: 'Products produced', value: Object.keys(productionGroups).length.toLocaleString() }
      );
      if (production.length) highlights.push(`${production.length.toLocaleString()} production record${production.length === 1 ? '' : 's'} were recorded in the selected period.`);
      else challenges.push('No completed production records were found for the selected period.');
      if (production.length) opportunities.push('Compare output by product and batch with sales and stock movement to guide the next production plan.');
      breakdowns.push({
        title: 'Output by product and unit',
        valueHeading: 'Quantity produced',
        detailHeading: 'Production records',
        items: Object.entries(productionGroups).map(([label, row]) => ({
          label,
          value: row.quantity.toLocaleString(),
          detail: row.batches.toLocaleString()
        }))
      });
    } else {
      const isWasteReport = reportType === 'damaged-expired';
      const selectedMovements = isWasteReport ? wasteMovements : movements;
      const netByUnit = movements.reduce((groups, movement) => {
        const unit = movement.products?.unit_of_measure || 'unit not specified';
        groups[unit] = (groups[unit] || 0) + signed(movement);
        return groups;
      }, {});
      metrics.push(
        { label: isWasteReport ? 'Damage / loss records' : 'Stock movement records', value: selectedMovements.length.toLocaleString() },
        ...(isWasteReport
          ? [{ label: 'Affected products', value: Object.keys(wasteGroups).length.toLocaleString() }]
          : [{ label: 'Movement types', value: new Set(movements.map((row) => row.movement_type)).size.toLocaleString() }])
      );
      if (isWasteReport && wasteMovements.length) challenges.push(`${wasteMovements.length.toLocaleString()} damage, expiry, or loss movement${wasteMovements.length === 1 ? '' : 's'} are recorded; review causes and any corrective action.`);
      if (!isWasteReport && movements.length) highlights.push(`${movements.length.toLocaleString()} stock movement records are included in the selected period.`);
      if (!selectedMovements.length) highlights.push(`No ${isWasteReport ? 'damage or loss' : 'stock movement'} records were found for the selected period.`);
      if (isWasteReport && wasteMovements.length) opportunities.push('Review loss descriptions by product and address recurring handling, storage, or expiry causes.');
      if (!isWasteReport && movements.length) opportunities.push('Reconcile purchases, production, sales, returns, waste, and adjustments to physical stock counts.');
      breakdowns.push(isWasteReport
        ? {
          title: 'Damage / loss by product and unit',
          valueHeading: 'Quantity affected',
          items: Object.entries(wasteGroups).map(([label, quantity]) => ({ label, value: quantity.toLocaleString() }))
        }
        : {
          title: 'Movement activity by type and unit',
          valueHeading: 'Quantity moved',
          detailHeading: 'Record count',
          items: Object.entries(movementGroups).map(([label, row]) => ({
            label,
            value: row.quantity.toLocaleString(),
            detail: row.records.toLocaleString()
          }))
        });
      if (!isWasteReport) {
        breakdowns.push({
          title: 'Net movement by unit of measure',
          valueHeading: 'Net quantity',
          items: Object.entries(netByUnit).map(([unit, quantity]) => ({ label: unit, value: quantity.toLocaleString() }))
        });
      }
    }

    return {
      metrics,
      highlights,
      challenges,
      opportunities,
      breakdowns,
      scopeNote: 'Agricultural output and stock movement are reported only from recorded production and inventory transactions, grouped by product and unit. Farm area, crop cycle, weather, and input-use data are not present in this report source, so yield per area and farm productivity ratios are not calculated.'
    };
  }, [products, production, movements, wasteMovements, reportType]);

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
        <div className="no-print flex space-x-3">
          <button type="button" onClick={() => window.print()} disabled={loading || Boolean(error)} className="rounded-lg bg-[#183b34] px-4 py-2 font-medium text-white hover:bg-[#102e28] disabled:cursor-not-allowed disabled:opacity-50">Print</button>
          <button type="button" onClick={handleDownload} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-60">Download CSV</button>
        </div>
      </div>

      <div className="amcoms-print-document rounded-lg border border-gray-200 bg-white p-8">
        <div className="amcoms-document-header mb-8 border-b-4 pb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
          <h2 className="mt-3 text-2xl font-bold text-gray-900">{REPORT_TYPES[reportType]}</h2>
          <p className="mt-2 text-sm text-gray-700">Period covered: {periodLabel}</p>
          <p className="mt-1 text-xs text-gray-500">Generated {new Date().toLocaleString('en-PH')}</p>
        </div>

        {!loading && !error && <ReportInsights {...analysis} />}
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
                      {isCurrentStock && cellIndex === 5
                        ? <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[cell]}`}>{cell}</span>
                        : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="document-signatures mt-8 grid grid-cols-2 gap-10 pt-8 text-center text-xs text-gray-700">
          <div className="border-t border-gray-700 pt-2">Prepared by: {staff?.full_name || 'Inventory Staff'}</div>
          <div className="border-t border-gray-700 pt-2">Reviewed by</div>
        </div>
      </div>
    </div>
  );
};

export default InventoryReports;

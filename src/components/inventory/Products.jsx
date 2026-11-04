import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { fetchActiveCategories } from '../../lib/categoryService';
import { getProductImage, getQuantityOnHand, getStockStatus } from '../../lib/inventoryService';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import AddProductModal, { EMPTY_PRODUCT_FORM, productToForm } from './AddProductModal';
import RestockModal from './RestockModal';
import OpeningInventoryCostModal from './OpeningInventoryCostModal';

const STATUS_STYLES = {
  Good: 'bg-green-100 text-green-800',
  Low: 'bg-amber-100 text-amber-800',
  'Out of Stock': 'bg-red-100 text-red-800'
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatDate = (value) => {
  if (!value) return 'Not yet restocked';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const ProductImage = ({ product, size = 'h-16 w-16' }) => {
  const src = getProductImage(product);
  return src ? (
    <img src={src} alt={product.product_name} className={`${size} rounded-lg border border-gray-200 object-cover`} />
  ) : (
    <div className={`${size} flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400`}>
      <Package size={24} />
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm font-semibold text-gray-900">{value}</p>
  </div>
);

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [stockFilter, setStockFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const requestId = useRef(0);

  const fetchProducts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const [productResult, categoryResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:product_categories(category_name), stock_inventory(quantity_on_hand, last_restock_date), inventory_cost_layers(quantity_remaining, unit_cost)')
        .eq('is_active', true)
        .order('product_code'),
      fetchActiveCategories()
    ]);
    if (currentRequest !== requestId.current) return;

    const failure = productResult.error || categoryResult.error;
    if (failure) {
      setError(getDataLoadErrorMessage(failure, 'products'));
    } else {
      setProducts(productResult.data || []);
      setCategories(categoryResult.data || []);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
    return () => {
      requestId.current += 1;
    };
  }, [fetchProducts]);

  useMultipleRealtimeSubscriptions(
    ['products', 'product_categories', 'stock_inventory', 'inventory_cost_layers'].map((table) => ({ table, onUpdate: fetchProducts })),
    [fetchProducts]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const searchFilteredProducts = term
      ? products.filter((product) =>
        product.product_name.toLowerCase().includes(term) || product.product_code.toLowerCase().includes(term)
      )
      : products;
    const filteredProducts = searchFilteredProducts.filter((product) => {
      const onHand = getQuantityOnHand(product);
      const status = getStockStatus(onHand, product.reorder_level);
      if (stockFilter === 'low') return status === 'Low';
      if (stockFilter === 'out') return status === 'Out of Stock';
      if (stockFilter === 'high') return status === 'Good';
      return true;
    });
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    return [...filteredProducts].sort((left, right) => {
      const nameOrder = collator.compare(left.product_name || '', right.product_name || '');
      const order = sortOrder === 'asc' ? nameOrder : -nameOrder;
      return order || collator.compare(left.product_code || '', right.product_code || '');
    });
  }, [products, search, sortOrder, stockFilter]);

  const nextProductCode = () => {
    const highest = products.reduce((max, product) => {
      const match = /(\d+)$/.exec(product.product_code);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `PRD-${String(highest + 1).padStart(3, '0')}`;
  };

  const closeModal = () => setModal(null);

  const handleSaved = (message) => {
    closeModal();
    setNotice(message);
    fetchProducts();
  };

  const latestRestock = (product) => {
    const rows = Array.isArray(product.stock_inventory) ? product.stock_inventory : [];
    return rows.map((row) => row.last_restock_date).filter(Boolean).sort().pop() || null;
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && (
        <p role="status" className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
          <button type="button" onClick={() => setNotice('')} className="ml-4 text-green-700 hover:underline">Dismiss</button>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <label htmlFor="product-sort-order" className="text-sm font-medium text-gray-700">Filter/Sort</label>
            <select
              id="product-sort-order"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              aria-label="Filter/Sort products"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="asc">A–Z</option>
              <option value="desc">Z–A</option>
            </select>
            <label htmlFor="product-stock-filter" className="sr-only">Filter products by stock status</label>
            <select
              id="product-stock-filter"
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              aria-label="Filter products by stock status"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="high">High stock</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: 'add' })}
            className="rounded-lg bg-orange-600 px-6 py-2 font-medium text-white transition-colors hover:bg-orange-700"
          >
            + Add New Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && <p className="py-10 text-center text-gray-500">Loading products…</p>}
        {!loading && visibleProducts.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-white py-10 text-center text-gray-500">
            {products.length === 0
              ? 'No products have been added yet.'
              : search || stockFilter !== 'all'
                ? 'No products match the selected search and stock filters.'
                : 'No products are available.'}
          </p>
        )}
        {visibleProducts.map((product) => {
          const onHand = getQuantityOnHand(product);
          const costLayers = product.inventory_cost_layers || [];
          const valuedQuantity = costLayers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0), 0);
          const unvaluedQuantity = Math.max(onHand - valuedQuantity, 0);
          const fifoValue = costLayers.reduce((sum, layer) => sum + Number(layer.quantity_remaining || 0) * Number(layer.unit_cost || 0), 0);
          const status = getStockStatus(onHand, product.reorder_level);
          const isExpanded = expandedId === product.id;
          return (
            <div key={product.id} className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <ProductImage product={product} />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{product.product_name}</h3>
                    <p className="text-sm text-gray-600">
                      ID: {product.product_code}{product.category?.category_name ? ` • ${product.category.category_name}` : ''}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>{status}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 md:grid-cols-5">
                <Stat label="Unit" value={product.unit_of_measure} />
                <Stat label="Current Stock" value={onHand.toLocaleString()} />
                <Stat label="Min Stock Level" value={Number(product.reorder_level || 0).toLocaleString()} />
                <Stat label="Last Restocked" value={formatDate(latestRestock(product))} />
                <Stat label="FIFO Stock Value" value={formatMoney(fifoValue)} />
              </div>
              {unvaluedQuantity > 0 && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {unvaluedQuantity.toLocaleString()} {product.unit_of_measure} need verified opening FIFO costs before they can be sold.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ type: 'restock', product })}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  Restock
                </button>
                {unvaluedQuantity > 0 && (
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'opening-cost', product, unvaluedQuantity })}
                    className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
                  >
                    Value existing stock
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModal({ type: 'edit', product })}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                  aria-expanded={isExpanded}
                  className="rounded-lg bg-orange-100 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-200"
                >
                  {isExpanded ? 'Hide' : 'View'}
                </button>
              </div>

              {isExpanded && (
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 text-sm md:grid-cols-4">
                  <div><dt className="text-xs text-gray-500">Selling Price</dt><dd className="font-semibold text-gray-900">{formatMoney(product.unit_price)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Cost Price</dt><dd className="font-semibold text-gray-900">{formatMoney(product.cost_price)}</dd></div>
                  {product.description && (
                    <div className="col-span-2 md:col-span-4"><dt className="text-xs text-gray-500">Description</dt><dd className="text-gray-700">{product.description}</dd></div>
                  )}
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>How stock works:</strong> a new product starts at 0 and shows Out of Stock. Use Restock to add received stock;
          each restock is logged in Inventory Tracking. Stock also changes through Stock Management and Production.
        </p>
      </div>

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <AddProductModal
          product={modal.product || null}
          initialForm={modal.product ? productToForm(modal.product) : { ...EMPTY_PRODUCT_FORM, product_code: nextProductCode() }}
          categories={categories}
          onClose={closeModal}
          onCategoriesChanged={fetchProducts}
          onSaved={() => handleSaved(modal.type === 'add' ? 'Product added with 0 stock. Use Restock to record received stock.' : 'Product updated.')}
        />
      )}

      {modal?.type === 'restock' && (
        <RestockModal
          product={modal.product}
          currentStock={getQuantityOnHand(modal.product)}
          onClose={closeModal}
          onSaved={() => handleSaved(`Restock recorded for ${modal.product.product_name}.`)}
        />
      )}
      {modal?.type === 'opening-cost' && (
        <OpeningInventoryCostModal
          product={modal.product}
          unvaluedQuantity={modal.unvaluedQuantity}
          onClose={closeModal}
          onSaved={(message) => handleSaved(message)}
        />
      )}
    </div>
  );
};

export default Products;

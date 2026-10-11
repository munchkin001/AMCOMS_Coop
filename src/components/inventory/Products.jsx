import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getProductImage, getQuantityOnHand, getStockStatus } from '../../lib/inventoryService';

const STATUS_STYLES = {
  Good: 'bg-green-100 text-green-800',
  Low: 'bg-amber-100 text-amber-800',
  'Out of Stock': 'bg-red-100 text-red-800'
};

const EMPTY_FORM = {
  product_code: '',
  product_name: '',
  category_id: '',
  unit_of_measure: 'Pack',
  unit_price: '',
  cost_price: '',
  reorder_level: '',
  description: ''
};

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

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

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const requestId = useRef(0);

  const fetchProducts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const [productResult, categoryResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:product_categories(category_name), stock_inventory(quantity_on_hand, last_restock_date)')
        .eq('is_active', true)
        .order('product_code'),
      supabase.from('product_categories').select('id, category_name').eq('is_active', true).order('category_name')
    ]);
    if (currentRequest !== requestId.current) return;

    const failure = productResult.error || categoryResult.error;
    if (failure) {
      setError(`Unable to load products: ${failure.message}`);
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
    ['products', 'product_categories', 'stock_inventory'].map((table) => ({ table, onUpdate: fetchProducts })),
    [fetchProducts]
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      product.product_name.toLowerCase().includes(term) || product.product_code.toLowerCase().includes(term)
    );
  }, [products, search]);

  const nextProductCode = () => {
    const highest = products.reduce((max, product) => {
      const match = /(\d+)$/.exec(product.product_code);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `PRD-${String(highest + 1).padStart(3, '0')}`;
  };

  const openAdd = () => {
    setEditingId(null);
    setFormError('');
    setForm({ ...EMPTY_FORM, product_code: nextProductCode() });
  };

  const openEdit = (product) => {
    setEditingId(product.id);
    setFormError('');
    setForm({
      product_code: product.product_code,
      product_name: product.product_name,
      category_id: product.category_id || '',
      unit_of_measure: product.unit_of_measure,
      unit_price: String(product.unit_price ?? ''),
      cost_price: String(product.cost_price ?? ''),
      reorder_level: String(product.reorder_level ?? ''),
      description: product.description || ''
    });
  };

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
  };

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSaving(true);

    const payload = {
      product_code: form.product_code.trim(),
      product_name: form.product_name.trim(),
      category_id: form.category_id || null,
      unit_of_measure: form.unit_of_measure.trim(),
      unit_price: Number(form.unit_price || 0),
      cost_price: Number(form.cost_price || 0),
      reorder_level: Math.round(Number(form.reorder_level || 0)),
      description: form.description.trim() || null
    };

    const result = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId)
      : await supabase.from('products').insert(payload);

    setSaving(false);
    if (result.error) {
      setFormError(result.error.code === '23505'
        ? 'A product with this code already exists.'
        : `Unable to save product: ${result.error.message}`);
      return;
    }
    closeForm();
    fetchProducts();
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-600">Manage cooperative products and inventory items</p>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={openAdd}
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
            {products.length === 0 ? 'No products have been added yet.' : 'No products match your search.'}
          </p>
        )}
        {visibleProducts.map((product) => {
          const onHand = getQuantityOnHand(product);
          const status = getStockStatus(onHand, product.reorder_level);
          const isExpanded = expandedId === product.id;
          const lastRestock = product.stock_inventory?.[0]?.last_restock_date;
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
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">Unit</p>
                  <p className="text-sm font-semibold text-gray-900">{product.unit_of_measure}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Current Stock</p>
                  <p className="text-sm font-semibold text-gray-900">{onHand.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Min Stock Level</p>
                  <p className="text-sm font-semibold text-gray-900">{Number(product.reorder_level || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => openEdit(product)}
                    className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : product.id)}
                    aria-expanded={isExpanded}
                    className="flex-1 rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-200"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 text-sm md:grid-cols-4">
                  <div><dt className="text-xs text-gray-500">Selling Price</dt><dd className="font-semibold text-gray-900">{formatMoney(product.unit_price)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Cost Price</dt><dd className="font-semibold text-gray-900">{formatMoney(product.cost_price)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Last Restocked</dt><dd className="font-semibold text-gray-900">{lastRestock || 'Not yet restocked'}</dd></div>
                  <div><dt className="text-xs text-gray-500">Stock Value (at cost)</dt><dd className="font-semibold text-gray-900">{formatMoney(onHand * Number(product.cost_price || 0))}</dd></div>
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
          <strong>Product Management:</strong> Add new products, update information, set minimum stock levels, and monitor product status.
          Current stock changes through Stock Management and Production.
        </p>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 id="product-form-title" className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
              <button type="button" onClick={closeForm} aria-label="Close" className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
            </div>
            {formError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="product-code" className={labelClass}>Product Code *</label>
                <input id="product-code" required value={form.product_code} onChange={updateField('product_code')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="product-name" className={labelClass}>Product Name *</label>
                <input id="product-name" required value={form.product_name} onChange={updateField('product_name')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="product-category" className={labelClass}>Category</label>
                <select id="product-category" value={form.category_id} onChange={updateField('category_id')} className={inputClass}>
                  <option value="">No category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="product-unit" className={labelClass}>Unit *</label>
                <input id="product-unit" required value={form.unit_of_measure} onChange={updateField('unit_of_measure')} placeholder="Pack, kg, piece" className={inputClass} />
              </div>
              <div>
                <label htmlFor="product-price" className={labelClass}>Selling Price</label>
                <input id="product-price" type="number" min="0" step="0.01" value={form.unit_price} onChange={updateField('unit_price')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="product-cost" className={labelClass}>Cost Price</label>
                <input id="product-cost" type="number" min="0" step="0.01" value={form.cost_price} onChange={updateField('cost_price')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="product-reorder" className={labelClass}>Min Stock Level</label>
                <input id="product-reorder" type="number" min="0" step="1" value={form.reorder_level} onChange={updateField('reorder_level')} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="product-description" className={labelClass}>Description</label>
                <textarea id="product-description" rows={2} value={form.description} onChange={updateField('description')} className={inputClass} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeForm} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Products;

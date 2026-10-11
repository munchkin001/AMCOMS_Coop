import React, { useState } from 'react';
import { X } from 'lucide-react';
import CategorySelect from './CategorySelect';
import { createProduct } from '../../lib/inventoryService';
import { supabase } from '../../lib/supabase';

export const EMPTY_PRODUCT_FORM = {
  product_code: '',
  product_name: '',
  category_id: '',
  unit_of_measure: '',
  unit_price: '',
  cost_price: '',
  reorder_level: '',
  description: ''
};

export const productToForm = (product) => ({
  product_code: product.product_code,
  product_name: product.product_name,
  category_id: product.category_id || '',
  unit_of_measure: product.unit_of_measure,
  unit_price: String(product.unit_price ?? ''),
  cost_price: String(product.cost_price ?? ''),
  reorder_level: String(product.reorder_level ?? ''),
  description: product.description || ''
});

const FormField = ({ id, label, error, className, children }) => (
  <div className={className}>
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
      {label} <span className="text-red-600" aria-hidden="true">*</span>
    </label>
    {children}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>
);

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2';

const AddProductModal = ({ product = null, initialForm, categories, onClose, onSaved, onCategoriesChanged }) => {
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(product);

  const inputFor = (field) => `${inputClass} ${fieldErrors[field]
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
    : 'border-gray-300 focus:border-orange-500 focus:ring-orange-500/30'}`;

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = () => {
    const errors = {};
    [['product_code', 'Product code'], ['product_name', 'Product name'], ['unit_of_measure', 'Unit'], ['description', 'Description']]
      .forEach(([field, label]) => {
        if (!form[field].trim()) errors[field] = `${label} is required.`;
      });

    if (!form.category_id) errors.category_id = 'Select a category.';
    else if (!categories.some((category) => category.id === form.category_id)) {
      errors.category_id = 'The selected category is no longer available. Choose another category.';
    }

    [['unit_price', 'Selling price'], ['cost_price', 'Cost price']].forEach(([field, label]) => {
      const raw = form[field].trim();
      if (raw === '') errors[field] = `${label} is required.`;
      else if (!Number.isFinite(Number(raw)) || Number(raw) < 0) errors[field] = `${label} must be a number of 0 or more.`;
    });

    const minStock = form.reorder_level.trim();
    if (minStock === '') errors.reorder_level = 'Min stock level is required.';
    else if (!/^\d+$/.test(minStock)) errors.reorder_level = 'Min stock level must be a whole number of 0 or more.';
    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    const payload = {
      product_code: form.product_code.trim(),
      product_name: form.product_name.trim(),
      category_id: form.category_id,
      unit_of_measure: form.unit_of_measure.trim(),
      unit_price: Number(form.unit_price),
      cost_price: Number(form.cost_price),
      reorder_level: Number(form.reorder_level),
      description: form.description.trim()
    };

    const { error } = isEditing
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await createProduct(payload);
    setSaving(false);

    if (error) {
      setFormError(error.code === '23505'
        ? 'A product with this code already exists.'
        : `Unable to save product: ${error.message}`);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
      <form onSubmit={handleSubmit} noValidate className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="product-form-title" className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit Product' : 'Add New Product'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
        </div>
        {!isEditing && (
          <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            New products start with 0 stock and show as Out of Stock until a restock is recorded.
          </p>
        )}
        {formError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="product-code" label="Product Code" error={fieldErrors.product_code}>
            <input id="product-code" value={form.product_code} onChange={updateField('product_code')} aria-invalid={!!fieldErrors.product_code} className={inputFor('product_code')} />
          </FormField>
          <FormField id="product-name" label="Product Name" error={fieldErrors.product_name}>
            <input id="product-name" value={form.product_name} onChange={updateField('product_name')} aria-invalid={!!fieldErrors.product_name} className={inputFor('product_name')} />
          </FormField>
          <FormField id="product-category" label="Category" error={fieldErrors.category_id}>
            <CategorySelect
              id="product-category"
              value={form.category_id}
              categories={categories}
              invalid={!!fieldErrors.category_id}
              onChange={(categoryId) => {
                setForm((current) => ({ ...current, category_id: categoryId }));
                setFieldErrors((current) => ({ ...current, category_id: undefined }));
              }}
              onCategoriesChanged={onCategoriesChanged}
            />
          </FormField>
          <FormField id="product-unit" label="Unit" error={fieldErrors.unit_of_measure}>
            <input id="product-unit" value={form.unit_of_measure} onChange={updateField('unit_of_measure')} placeholder="Pack, Kilo, PCS" aria-invalid={!!fieldErrors.unit_of_measure} className={inputFor('unit_of_measure')} />
          </FormField>
          <FormField id="product-price" label="Selling Price" error={fieldErrors.unit_price}>
            <input id="product-price" type="number" min="0" step="0.01" value={form.unit_price} onChange={updateField('unit_price')} aria-invalid={!!fieldErrors.unit_price} className={inputFor('unit_price')} />
          </FormField>
          <FormField id="product-cost" label="Cost Price" error={fieldErrors.cost_price}>
            <input id="product-cost" type="number" min="0" step="0.01" value={form.cost_price} onChange={updateField('cost_price')} aria-invalid={!!fieldErrors.cost_price} className={inputFor('cost_price')} />
          </FormField>
          <FormField id="product-reorder" label="Min Stock Level" error={fieldErrors.reorder_level}>
            <input id="product-reorder" type="number" min="0" step="1" value={form.reorder_level} onChange={updateField('reorder_level')} aria-invalid={!!fieldErrors.reorder_level} className={inputFor('reorder_level')} />
          </FormField>
          <FormField id="product-description" label="Description" error={fieldErrors.description} className="md:col-span-2">
            <textarea id="product-description" rows={2} value={form.description} onChange={updateField('description')} aria-invalid={!!fieldErrors.description} className={inputFor('description')} />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProductModal;

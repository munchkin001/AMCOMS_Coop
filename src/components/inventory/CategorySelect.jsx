import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  createCategory,
  DEFAULT_CATEGORIES,
  deleteCategory,
  isStandardCategory,
  seedDefaultCategories
} from '../../lib/categoryService';

const fieldClass = 'w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2';
const normalClass = 'border-gray-300 focus:border-orange-500 focus:ring-orange-500/30';
const errorClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/30';

const CategorySelect = ({ id, value, categories, onChange, onCategoriesChanged, invalid = false }) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const hasMissingDefaults = DEFAULT_CATEGORIES.some(
    (preset) => !categories.some((category) => category.category_name.toLowerCase() === preset.category_name.toLowerCase())
  );
  const selected = categories.find((category) => category.id === value);

  const choose = (categoryId) => {
    onChange(categoryId);
    setOpen(false);
    setMessage('');
  };

  const cancelAdd = () => {
    setAdding(false);
    setName('');
    setDescription('');
    setMessage('');
  };

  const saveCategory = async () => {
    if (!name.trim()) {
      setMessage('Enter a category name.');
      return;
    }
    setBusy(true);
    const { data, error } = await createCategory({ name, description });
    if (error || !data) {
      setBusy(false);
      setMessage(`Unable to add category: ${error?.message || 'unknown error'}`);
      return;
    }
    await onCategoriesChanged?.();
    setBusy(false);
    onChange(data.id);
    cancelAdd();
  };

  const addStandard = async () => {
    setBusy(true);
    const { error } = await seedDefaultCategories();
    if (error) setMessage(`Unable to add standard categories: ${error.message}`);
    else {
      setMessage('');
      await onCategoriesChanged?.();
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    setBusy(true);
    const { error } = await deleteCategory(target.id);
    if (error) {
      setBusy(false);
      setPendingDelete(null);
      setMessage(error.message);
      return;
    }
    if (value === target.id) onChange('');
    await onCategoriesChanged?.();
    setBusy(false);
    setPendingDelete(null);
    setMessage('');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        onClick={() => setOpen((current) => !current)}
        className={`${fieldClass} flex items-center justify-between text-left ${invalid ? errorClass : normalClass}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{selected ? selected.category_name : 'Select a category'}</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>

      {open && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {categories.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No categories yet.</li>}
          {categories.map((category) => (
            <li key={category.id} role="option" aria-selected={category.id === value} className="flex items-center justify-between hover:bg-orange-50">
              <button type="button" onClick={() => choose(category.id)} className={`flex-1 px-3 py-2 text-left text-sm ${category.id === value ? 'font-medium text-orange-700' : 'text-gray-800'}`}>
                {category.category_name}
              </button>
              {!isStandardCategory(category) && (
                <button
                  type="button"
                  aria-label={`Delete category ${category.category_name}`}
                  onClick={() => {
                    setOpen(false);
                    setMessage('');
                    setPendingDelete(category);
                  }}
                  className="mr-2 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
          <li className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAdding(true);
                setMessage('');
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-orange-600 hover:bg-orange-50"
            >
              <Plus size={15} /> Add new category
            </button>
          </li>
        </ul>
      )}


      {!adding && hasMissingDefaults && (
        <button type="button" onClick={addStandard} disabled={busy} className="mt-1 text-xs font-medium text-orange-600 hover:underline disabled:opacity-60">
          {busy ? 'Working…' : 'Add standard cooperative categories'}
        </button>
      )}

      {adding && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input aria-label="New category name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" className={`${fieldClass} ${normalClass}`} autoFocus />
          <input aria-label="New category description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className={`${fieldClass} ${normalClass}`} />
          <div className="flex gap-2">
            <button type="button" onClick={saveCategory} disabled={busy} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60">
              {busy ? 'Saving…' : 'Save category'}
            </button>
            <button type="button" onClick={cancelAdd} className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {message && <p role="alert" className="mt-1 text-xs text-red-700">{message}</p>}

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-category-title">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h4 id="delete-category-title" className="text-base font-semibold text-gray-900">Delete category?</h4>
            <p className="mt-2 text-sm text-gray-600">
              &quot;{pendingDelete.category_name}&quot; will be permanently deleted. A category that still has products assigned cannot be deleted.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={busy} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;

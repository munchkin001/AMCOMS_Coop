import { supabase } from './supabase';

export const DEFAULT_CATEGORIES = [
  {
    category_code: 'CAT-AGRI',
    category_name: 'Agricultural Supplies',
    description: 'Fertilizers, Pesticides, Seeds, Feeds'
  },
  {
    category_code: 'CAT-GROC',
    category_name: 'Consumer Goods & Groceries',
    description: 'Grains/Rice, Canned Goods, Beverages'
  },
  {
    category_code: 'CAT-OFFC',
    category_name: 'Office & Operational Supplies',
    description: 'Stationery, Packaging, Sanitation'
  },
  {
    category_code: 'CAT-HARD',
    category_name: 'Hardware & Equipment',
    description: 'Farm Tools, Spare Parts, Maintenance'
  }
];

const CATEGORY_COLUMNS = 'id, category_code, category_name, description, is_active';

export const fetchActiveCategories = () =>
  supabase.from('product_categories').select(CATEGORY_COLUMNS).eq('is_active', true).order('category_name');

const makeCode = (name) => {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'NEW';
  return `CAT-${slug}`;
};

export const createCategory = async ({ name, description }) => {
  const trimmedName = name.trim();
  if (!trimmedName) return { data: null, error: new Error('Category name is required.') };

  const { data: existing } = await supabase
    .from('product_categories')
    .select(CATEGORY_COLUMNS)
    .ilike('category_name', trimmedName)
    .maybeSingle();
  if (existing) {
    if (existing.is_active) return { data: existing, error: null };
    return supabase
      .from('product_categories')
      .update({ is_active: true })
      .eq('id', existing.id)
      .select(CATEGORY_COLUMNS)
      .single();
  }

  const baseCode = makeCode(trimmedName);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await supabase
      .from('product_categories')
      .insert({
        category_code: attempt === 0 ? baseCode : `${baseCode}-${attempt + 1}`,
        category_name: trimmedName,
        description: description?.trim() || null
      })
      .select(CATEGORY_COLUMNS)
      .single();
    if (result.error?.code !== '23505') return result;
  }
  return { data: null, error: new Error('Unable to generate a unique category code.') };
};

// Seeded categories are protected from deletion in the UI.
export const isStandardCategory = (category) =>
  DEFAULT_CATEGORIES.some((preset) => preset.category_code === category.category_code);

export const deleteCategory = async (categoryId) => {
  const { count, error: countError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);
  if (countError) return { error: countError };
  if (count > 0) {
    return { error: new Error(`Cannot delete category containing active products (${count} assigned).`), blocked: true };
  }

  const { data, error } = await supabase.from('product_categories').delete().eq('id', categoryId).select('id');
  if (error) {
    return {
      error: error.code === '23503'
        ? new Error('Cannot delete category containing active products.')
        : error,
      blocked: error.code === '23503'
    };
  }
  if (!data || data.length === 0) return { error: new Error('Category was not deleted. You may not have permission, or it no longer exists.') };
  return { error: null };
};

// Adds only the standard categories that are not present yet (matched by name).
export const seedDefaultCategories = async () => {
  const { data, error } = await supabase.from('product_categories').select('category_name');
  if (error) return { error };
  const present = new Set((data || []).map((row) => row.category_name.toLowerCase()));
  const missing = DEFAULT_CATEGORIES.filter((category) => !present.has(category.category_name.toLowerCase()));
  if (missing.length === 0) return { error: null };
  const { error: insertError } = await supabase.from('product_categories').upsert(missing, { onConflict: 'category_code', ignoreDuplicates: true });
  return { error: insertError };
};

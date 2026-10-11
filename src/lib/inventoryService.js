import { supabase } from './supabase';

export const INBOUND_TYPES = ['purchase', 'production', 'return'];

export const STOCK_IN_SOURCES = [
  { label: 'Production', type: 'production' },
  { label: 'Supplier', type: 'purchase' },
  { label: 'BFT', type: 'purchase' },
  { label: 'Returned', type: 'return' },
  { label: 'Other', type: 'adjustment' }
];

export const STOCK_OUT_REASONS = [
  { label: 'Sold', type: 'sale' },
  { label: 'Damaged', type: 'waste' },
  { label: 'Expired', type: 'waste' },
  { label: 'Lost', type: 'waste' },
  { label: 'Transferred', type: 'transfer' },
  { label: 'Other', type: 'adjustment' }
];

const PRODUCT_IMAGES = [
  { match: 'sugar', src: '/sugar.jpg' },
  { match: 'turmeric', src: '/turmeric.jpg' },
  { match: 'crunch', src: '/crunch.jpg' }
];

export const getProductImage = (product) => {
  if (product?.image_url) return product.image_url;
  const name = (product?.product_name || '').toLowerCase();
  return PRODUCT_IMAGES.find((image) => name.includes(image.match))?.src || null;
};

export const getStockStatus = (onHand, reorderLevel) => {
  if (onHand <= 0) return 'Out of Stock';
  if (onHand <= Number(reorderLevel || 0)) return 'Low';
  return 'Good';
};

export const getQuantityOnHand = (product) => {
  const inventory = product?.stock_inventory;
  const rows = Array.isArray(inventory) ? inventory : inventory ? [inventory] : [];
  return rows.reduce((total, row) => total + Number(row.quantity_on_hand || 0), 0);
};

const getStaffId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('staff').select('id').eq('user_id', user.id).maybeSingle();
  return data?.id || null;
};

const adjustInventory = async (productId, delta, date, isRestock) => {
  const { data: rows, error } = await supabase
    .from('stock_inventory')
    .select('id, quantity_on_hand')
    .eq('product_id', productId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;

  const current = rows?.[0];
  const next = Number(current?.quantity_on_hand || 0) + delta;
  if (next < 0) {
    throw new Error(`Not enough stock. Only ${Number(current?.quantity_on_hand || 0).toLocaleString()} on hand.`);
  }

  const fields = {
    quantity_on_hand: next,
    ...(isRestock ? { last_restock_date: date } : {})
  };
  const result = current
    ? await supabase.from('stock_inventory').update(fields).eq('id', current.id)
    : await supabase.from('stock_inventory').insert({ product_id: productId, ...fields });
  if (result.error) throw result.error;
  return { inventoryId: current?.id };
};

/**
 * Records a stock movement and keeps stock_inventory in step with it.
 * `quantity` is always a positive magnitude; `direction` is 1 (in) or -1 (out).
 */
export const recordStockMovement = async ({
  productId,
  movementType,
  quantity,
  direction,
  date,
  reference = null,
  description = null
}) => {
  const amount = Math.abs(Math.round(Number(quantity)));
  if (!productId) throw new Error('Select a product.');
  if (!amount) throw new Error('Enter a quantity greater than zero.');

  const delta = direction * amount;
  await adjustInventory(productId, delta, date, delta > 0);

  const { error } = await supabase.from('stock_movements').insert({
    product_id: productId,
    movement_type: movementType,
    quantity: movementType === 'adjustment' ? delta : amount,
    reference_number: reference,
    movement_date: date,
    description,
    created_by: await getStaffId()
  });

  if (error) {
    await adjustInventory(productId, -delta, date, false).catch(() => {});
    throw error;
  }
};

export const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const downloadCsv = (filename, rows) => {
  const blob = new Blob([rows.map((row) => row.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

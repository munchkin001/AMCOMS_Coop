import { supabase } from './supabase';
import { toDateString } from './dashboardAccounting';
import { queueOperation, getOperation } from './Offline/syncQueue';
import { syncPendingOperations } from './Offline/syncOperations';

export const INBOUND_TYPES = ['purchase', 'production', 'return'];

export const STOCK_IN_SOURCES = [
  { label: 'Production', type: 'production' },
  { label: 'Supplier', type: 'purchase' },
  { label: 'BFT', type: 'purchase' },
  { label: 'Returned', type: 'return' },
  { label: 'Other', type: 'adjustment' }
];

export const STOCK_OUT_REASONS = [
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

/**
 * Records a stock movement and its FIFO layer in one database transaction.
 * `quantity` is a positive magnitude; `direction` is 1 (in) or -1 (out).
 */
export const recordStockMovement = async ({
  productId,
  movementType,
  quantity,
  direction,
  date,
  reference = null,
  description = null,
  unitCost = null,
  userId
}) => {
  const amount = Math.abs(Number(quantity));
  if (!productId) throw new Error('Select a product.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a whole-number quantity greater than zero.');

  const operationId = await queueOperation({
    type: 'inventory_movement',
    userId,
    payload: {
      productId,
      movementType,
      quantity: amount,
      direction,
      date,
      reference,
      description,
      unitCost: unitCost === null || unitCost === '' ? null : Number(unitCost)
    }
  });

  if (navigator.onLine) await syncPendingOperations();
  const operation = await getOperation(operationId);
  return {
    status: operation?.status || 'pending',
    lastError: operation?.lastError || null,
    operationId
  };
};

/**
 * Registers a product in the catalogue. It starts with zero stock; stock only
 * increases through a restock or another recorded movement.
 */
export const createProduct = async (payload) => {
  const { data, error } = await supabase.rpc('create_inventory_product', { p_product: payload });
  if (error) return { error };
  return { data: { id: data }, error: null };
};

/**
 * Restock = a "purchase" stock movement. It increments stock_inventory,
 * stamps last_restock_date and writes the audit row in stock_movements
 * (who, when, quantity, supplier, invoice).
 */
export const restockProduct = async ({ productId, quantity, unitCost, supplier, reference, date }) => {
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Restock quantity must be a whole number greater than zero.');
  if (!(Number(unitCost) > 0)) throw new Error('Enter the verified per-unit cost from the supplier invoice.');
  if (!reference?.trim()) throw new Error('Enter the supplier invoice number to post the payable.');
  await recordStockMovement({
    productId,
    movementType: 'purchase',
    quantity: amount,
    direction: 1,
    date: date || toDateString(new Date()),
    reference: reference.trim(),
    description: supplier?.trim() ? `Restock from ${supplier.trim()}` : 'Restock',
    unitCost: Number(unitCost)
  });
};

const getSupplierId = async (name) => {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data: existing, error } = await supabase
    .from('suppliers')
    .select('id')
    .ilike('supplier_name', trimmed.replace(/[%_]/g, '\\$&'))
    .limit(1);
  if (error) throw error;
  if (existing?.[0]) return existing[0].id;

  const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
  const { data, error: insertError } = await supabase
    .from('suppliers')
    .insert({ supplier_code: code, supplier_name: trimmed })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return data.id;
};

export const generatePurchaseNumber = (date) => {
  const day = (date || toDateString(new Date())).replace(/-/g, '');
  return `PO-${day}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
};

export const receivePurchase = async (purchaseId) => {
  const { data: purchase, error } = await supabase
    .from('purchases')
    .select('id, status, purchase_items(id, quantity)')
    .eq('id', purchaseId)
    .single();
  if (error) throw error;
  if (purchase.status === 'received') throw new Error('This purchase has already been received.');
  if (purchase.status === 'cancelled') throw new Error('A cancelled purchase cannot be received.');

  // Purchased items are raw materials and supplies, so receiving one does not
  // change finished-product stock.
  for (const item of purchase.purchase_items || []) {
    const { error: itemError } = await supabase
      .from('purchase_items')
      .update({ received_quantity: item.quantity })
      .eq('id', item.id);
    if (itemError) throw itemError;
  }

  const { error: statusError } = await supabase.from('purchases').update({ status: 'received' }).eq('id', purchaseId);
  if (statusError) throw statusError;
};

export const cancelPurchase = async (purchaseId) => {
  const { data, error } = await supabase
    .from('purchases')
    .update({ status: 'cancelled' })
    .eq('id', purchaseId)
    .neq('status', 'received')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Only purchases that have not been received can be cancelled.');
};

/**
 * Creates a purchase of raw materials / supplies. Items are free-text (name +
 * unit) and are not linked to finished products. With `receiveNow` the order is
 * marked received immediately.
 */
export const createPurchase = async ({ supplierName, purchaseNumber, date, expectedDate, notes, items, receiveNow }) => {
  const purchaseDate = date || toDateString(new Date());
  const lines = (items || []).filter((item) => item.itemName?.trim());
  if (lines.length === 0) throw new Error('Add at least one item to the purchase.');
  for (const line of lines) {
    if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) {
      throw new Error('Each quantity must be a whole number greater than zero.');
    }
    if (!(Number(line.unitCost) >= 0)) throw new Error('Each unit cost must be zero or more.');
  }

  const number = purchaseNumber?.trim() || generatePurchaseNumber(purchaseDate);
  const { data: duplicate, error: duplicateError } = await supabase
    .from('purchases')
    .select('id')
    .eq('purchase_number', number)
    .limit(1);
  if (duplicateError) throw duplicateError;
  if (duplicate?.length) throw new Error(`Purchase / invoice number ${number} is already recorded.`);

  const total = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0);
  const supplierId = await getSupplierId(supplierName);

  const { data: purchase, error } = await supabase
    .from('purchases')
    .insert({
      purchase_number: number,
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      expected_delivery_date: expectedDate || null,
      total_amount: total,
      net_amount: total,
      status: 'ordered',
      payment_status: 'pending',
      notes: notes?.trim() || null,
      created_by: await getStaffId()
    })
    .select('id, purchase_number')
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from('purchase_items').insert(
    lines.map((line) => ({
      purchase_id: purchase.id,
      item_name: line.itemName.trim(),
      unit: line.unit?.trim() || null,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unitCost),
      line_total: Number(line.quantity) * Number(line.unitCost),
      received_quantity: 0
    }))
  );
  if (itemsError) {
    await supabase.from('purchases').delete().eq('id', purchase.id);
    throw itemsError;
  }

  if (receiveNow) await receivePurchase(purchase.id, purchaseDate);
  return purchase;
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

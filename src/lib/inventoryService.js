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
  userId,
  actorRole = null,
  actorName = null,
  allowLocalQueue = false
}) => {
  const amount = Math.abs(Number(quantity));
  if (!productId) throw new Error('Select a product.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a whole-number quantity greater than zero.');

  const operationId = await queueOperation({
    type: 'inventory_movement',
    userId,
    actorRole,
    actorName,
    allowLocalQueue,
    summary: `${movementType.replaceAll('_', ' ')} stock movement`,
    details: { quantity: amount, direction, date },
    entityId: productId,
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

export const generatePurchaseNumber = (date) => {
  const day = (date || toDateString(new Date())).replace(/-/g, '');
  return `PO-${day}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
};

const submitPurchaseWorkflow = async ({
  action,
  amount,
  purchase,
  sourceRecordId = null,
  offlineMode = false,
  user,
  staff
}) => {
  if (!user?.id || !staff?.role) {
    throw new Error('An authenticated staff profile is required to submit a purchase workflow.');
  }

  const operationId = crypto.randomUUID();
  const purchaseNumber = purchase.purchase_number;
  const submission = {
    p_submission_key: operationId,
    p_transaction_type: 'purchase',
    p_direction: 'noncash',
    p_source_module: 'inventory.purchases',
    p_source_record_id: sourceRecordId,
    p_member_id: null,
    p_counterparty_name: purchase.supplier_name || null,
    p_amount: Number(amount),
    p_payment_method: null,
    p_description: action === 'create'
      ? `Purchase order ${purchaseNumber}`
      : `${action === 'receive' ? 'Receive' : 'Cancel'} purchase ${purchaseNumber}`,
    p_payload: { action, amount: Number(amount), purchase }
  };
  if (!Number.isFinite(submission.p_amount) || submission.p_amount <= 0) {
    throw new Error('The purchase amount must be greater than zero.');
  }

  if (!navigator.onLine || offlineMode) {
    await queueOperation({
      type: 'transaction_workflow',
      payload: submission,
      userId: user.id,
      actorRole: staff.role,
      actorName: staff.full_name,
      allowLocalQueue: true,
      operationId,
      entityId: sourceRecordId,
      summary: `${submission.p_description} submitted for approval`,
      details: { amount: submission.p_amount, type: 'purchase' }
    });
    return { pendingSync: true, workflowId: null };
  }

  const { data, error } = await supabase.rpc('submit_transaction_workflow', submission);
  if (error) throw error;
  if (!data?.workflow_id) throw new Error('The server did not confirm the purchase approval request.');
  return { pendingApproval: true, workflowId: data.workflow_id };
};

/**
 * Creates a purchase of raw materials / supplies. Items are free-text (name +
 * unit) and are not linked to finished products. With `receiveNow` the order is
 * marked received immediately.
 */
export const createPurchase = async ({
  supplierName,
  purchaseNumber,
  date,
  expectedDate,
  notes,
  items,
  receiveNow,
  offlineMode = false,
  user,
  staff
}) => {
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
  const total = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('The purchase total must be greater than zero.');
  return submitPurchaseWorkflow({
    action: 'create',
    amount: total,
    offlineMode,
    user,
    staff,
    purchase: {
      purchase_number: number,
      supplier_name: supplierName.trim(),
      purchase_date: purchaseDate,
      expected_delivery_date: expectedDate || null,
      notes: notes?.trim() || null,
      receive_now: Boolean(receiveNow),
      items: lines.map((line) => ({
        item_name: line.itemName.trim(),
        unit: line.unit?.trim() || null,
        quantity: Number(line.quantity),
        unit_cost: Number(line.unitCost)
      }))
    }
  });
};

export const receivePurchase = async (purchaseId, {
  offlineMode = false,
  user,
  staff,
  purchase: suppliedPurchase
} = {}) => {
  let purchase = suppliedPurchase;
  if (!purchase) {
    const { data, error } = await supabase
      .from('purchases')
      .select('id, purchase_number, net_amount, status, suppliers(supplier_name)')
      .eq('id', purchaseId)
      .single();
    if (error) throw error;
    purchase = data;
  }
  if (purchase.status === 'received') throw new Error('This purchase has already been received.');
  if (purchase.status === 'cancelled') throw new Error('A cancelled purchase cannot be received.');
  return submitPurchaseWorkflow({
    action: 'receive',
    amount: purchase.net_amount,
    sourceRecordId: purchase.id,
    offlineMode,
    user,
    staff,
    purchase: {
      purchase_id: purchase.id,
      purchase_number: purchase.purchase_number,
      supplier_name: purchase.suppliers?.supplier_name || ''
    }
  });
};

export const cancelPurchase = async (purchaseId, {
  offlineMode = false,
  user,
  staff,
  purchase: suppliedPurchase
} = {}) => {
  let purchase = suppliedPurchase;
  if (!purchase) {
    const { data, error } = await supabase
      .from('purchases')
      .select('id, purchase_number, net_amount, status, suppliers(supplier_name)')
      .eq('id', purchaseId)
      .single();
    if (error) throw error;
    purchase = data;
  }
  if (['received', 'cancelled'].includes(purchase.status)) {
    throw new Error('Only unreceived purchases can be cancelled.');
  }
  return submitPurchaseWorkflow({
    action: 'cancel',
    amount: purchase.net_amount,
    sourceRecordId: purchase.id,
    offlineMode,
    user,
    staff,
    purchase: {
      purchase_id: purchase.id,
      purchase_number: purchase.purchase_number,
      supplier_name: purchase.suppliers?.supplier_name || ''
    }
  });
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

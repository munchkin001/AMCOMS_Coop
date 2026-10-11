-- Purchases are for raw materials and supplies, not finished products.
-- Line items are now described by name and unit; the product link is optional.

ALTER TABLE public.purchase_items
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_item_check;
ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_item_check
  CHECK (product_id IS NOT NULL OR NULLIF(trim(item_name), '') IS NOT NULL);

-- ============================================
-- FIX PURCHASE ITEMS SCHEMA
-- Add missing columns: item_name, unit
-- ============================================

-- These columns allow free-text item entry without requiring products table
-- Useful for one-off purchases that aren't in your regular product catalog

-- Check current schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'purchase_items'
ORDER BY ordinal_position;

-- Add item_name column (allows entering item name directly)
ALTER TABLE purchase_items 
ADD COLUMN IF NOT EXISTS item_name TEXT;

-- Add unit column (allows entering unit of measure directly)
ALTER TABLE purchase_items 
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Verify columns were added
SELECT 
  'Schema updated' as status,
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'purchase_items'
  AND column_name IN ('item_name', 'unit');

-- Expected output: 2 rows showing item_name and unit columns

-- ============================================
-- USAGE NOTES
-- ============================================
/*
After running this:

1. If product_id is set: Display product_name from products table
2. If product_id is NULL but item_name is set: Display item_name
3. Fallback: Display 'Unnamed item'

This allows both:
- Regular products (linked to products table)
- Ad-hoc purchases (free-text item_name)
*/

-- ============================================
-- ALTERNATIVE: Make product_id required
-- ============================================
/*
If you DON'T want free-text items and want everything 
to come from the products table, do this instead:

ALTER TABLE purchase_items
ALTER COLUMN product_id SET NOT NULL;

Then ensure all items link to products table.
The frontend fix already handles this case.
*/

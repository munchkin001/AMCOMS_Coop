-- Ensure raw-material purchase lines work even if the earlier conversion
-- migration was skipped on a deployed database.
ALTER TABLE public.purchase_items
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_item_check;

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_item_check
  CHECK (product_id IS NOT NULL OR NULLIF(trim(item_name), '') IS NOT NULL);

-- Purchase entry and receipt screens subscribe to changes in both tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Supabase Realtime publication is not available';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_items;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

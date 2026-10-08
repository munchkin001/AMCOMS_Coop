-- Publish public application tables for Supabase Realtime.
-- Every current public table has a primary key, so the default replica
-- identity is sufficient for INSERT, UPDATE, and DELETE events.
DO $$
DECLARE
  target_table RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Supabase realtime publication is not available';
  END IF;

  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_migrations'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname = 'public'
        AND pt.tablename = target_table.relname
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        target_table.relname
      );
    END IF;
  END LOOP;
END;
$$;

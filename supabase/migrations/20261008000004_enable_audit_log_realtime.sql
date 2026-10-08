-- Keep audit-log changes available to clients that subscribe to Supabase Realtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  END IF;
END;
$$;

-- Loan, savings, withdrawal and time deposit requests are now reviewed by the Bookkeeper.
-- Manager, treasurer and chairman keep read-only access (dashboards).

DROP POLICY IF EXISTS "Staff can view all requests" ON public.requests;
CREATE POLICY "Staff can view all requests"
  ON public.requests FOR SELECT
  USING (public.has_any_role(ARRAY['bookkeeper', 'manager', 'treasurer', 'chairman']));

DROP POLICY IF EXISTS "Authorized staff can review requests" ON public.requests;
DROP POLICY IF EXISTS "Bookkeepers can review requests" ON public.requests;
CREATE POLICY "Bookkeepers can review requests"
  ON public.requests FOR UPDATE
  USING (public.has_role('bookkeeper'))
  WITH CHECK (public.has_role('bookkeeper'));

-- Make sure live updates reach the bookkeeper page.
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['member_applications', 'requests', 'members'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- Allow the public landing page to read announcements that the manager
-- explicitly published to the 'public' audience.
DROP POLICY IF EXISTS "Public can view landing page announcements" ON public.announcements;
CREATE POLICY "Public can view landing page announcements"
  ON public.announcements FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND 'public' = ANY(target_roles)
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  );

GRANT SELECT ON public.announcements TO anon;

-- Stream announcement changes to the landing page in real time.
ALTER TABLE public.announcements REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END $$;

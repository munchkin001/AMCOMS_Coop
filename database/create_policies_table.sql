-- Create policies table for Chairman's policy management
CREATE TABLE IF NOT EXISTS public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  published_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Create policy for Chairman access
DROP POLICY IF EXISTS "Chairman can manage policies" ON public.policies;
CREATE POLICY "Chairman can manage policies" ON public.policies
  FOR ALL
  USING (public.has_role('chairman'))
  WITH CHECK (public.has_role('chairman'));

-- Create updated_at trigger
DROP TRIGGER IF EXISTS set_policies_updated_at ON public.policies;
CREATE TRIGGER set_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'policies'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.policies;
  END IF;
END $$;

-- Success message
SELECT 'Policies table created successfully!' as message;

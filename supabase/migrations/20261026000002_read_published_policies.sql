DROP POLICY IF EXISTS "Authenticated users can read published policies" ON public.policies;
CREATE POLICY "Authenticated users can read published policies" ON public.policies
  FOR SELECT TO authenticated
  USING (status = 'published');

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'staff';

ALTER TABLE public.policies
  DROP CONSTRAINT IF EXISTS policies_target_audience_check;

ALTER TABLE public.policies
  ADD CONSTRAINT policies_target_audience_check
  CHECK (target_audience IN ('staff', 'member'));

DROP POLICY IF EXISTS "Authenticated users can read published policies" ON public.policies;
CREATE POLICY "Users can read published policies for their audience"
  ON public.policies FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND (
      (target_audience = 'member' AND public.current_user_role() = 'member')
      OR (
        target_audience = 'staff'
        AND public.current_user_role() IS NOT NULL
        AND public.current_user_role() <> 'member'
      )
    )
  );

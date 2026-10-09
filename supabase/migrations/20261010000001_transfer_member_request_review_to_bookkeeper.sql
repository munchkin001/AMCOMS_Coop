-- Membership requests are now reviewed by the Bookkeeper instead of the Manager/Chairman.
-- Approval still runs through create_member_from_application(), which creates the
-- members row (and so raises the Members count) only when a request is approved.

ALTER TABLE public.member_applications
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

DROP POLICY IF EXISTS "Staff can view all applications" ON public.member_applications;
CREATE POLICY "Bookkeepers can view all applications"
  ON public.member_applications FOR SELECT
  USING (public.has_role('bookkeeper'));

DROP POLICY IF EXISTS "Managers can review applications" ON public.member_applications;
DROP POLICY IF EXISTS "Managers can update applications" ON public.member_applications;
DROP POLICY IF EXISTS "Bookkeepers can review applications" ON public.member_applications;
CREATE POLICY "Bookkeepers can review applications"
  ON public.member_applications FOR UPDATE
  USING (public.has_role('bookkeeper'))
  WITH CHECK (public.has_role('bookkeeper'));

CREATE OR REPLACE FUNCTION public.review_member_application(
  p_application_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason TEXT := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only the Bookkeeper can review membership requests';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  UPDATE public.member_applications
  SET status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = v_reason,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN v_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_application_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request was not found or has already been reviewed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_member_application(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_member_application(UUID, TEXT, TEXT) TO authenticated;

-- Ensure the Manager approval RPC is available to PostgREST. Approval updates
-- the request; the existing trigger creates an approved loan for Bookkeeper release.
CREATE OR REPLACE FUNCTION public.review_loan_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.requests%ROWTYPE;
  v_staff_id UUID := public.current_staff_id();
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('manager') THEN
    RAISE EXCEPTION 'Only an active Manager can review loan applications';
  END IF;
  IF p_request_id IS NULL
     OR p_decision IS NULL
     OR p_decision NOT IN ('approved', 'rejected')
     OR COALESCE(trim(p_notes), '') = '' THEN
    RAISE EXCEPTION 'Choose approve or reject and provide decision notes';
  END IF;

  SELECT *
  INTO v_request
  FROM public.requests
  WHERE id = p_request_id
    AND request_type = 'loan_application'
  FOR UPDATE;

  IF NOT FOUND OR v_request.status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'This loan application was not found or has already been reviewed';
  END IF;

  UPDATE public.requests
  SET status = p_decision,
      reviewed_by = v_staff_id,
      reviewed_at = now(),
      review_notes = trim(p_notes),
      approved_by = CASE WHEN p_decision = 'approved' THEN v_staff_id ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
      approval_notes = CASE WHEN p_decision = 'approved' THEN trim(p_notes) ELSE NULL END,
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_loan_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_loan_request(UUID, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS create_loan_on_request_approval ON public.requests;
CREATE TRIGGER create_loan_on_request_approval
  AFTER UPDATE OF status ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.create_loan_from_request();

DROP POLICY IF EXISTS "Bookkeeper can view all loans" ON public.loans;
CREATE POLICY "Bookkeeper can view all loans"
  ON public.loans FOR SELECT
  USING (public.has_role('bookkeeper'));

NOTIFY pgrst, 'reload schema';

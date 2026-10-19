-- Members can no longer submit loan applications directly. Bookkeepers enter
-- applications for members and Managers retain the existing approval workflow.
CREATE OR REPLACE FUNCTION public.submit_loan_request(
  p_amount NUMERIC,
  p_loan_type TEXT,
  p_purpose TEXT,
  p_term_months INTEGER,
  p_frequency TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Loan applications must be entered by a Bookkeeper for Manager review.';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_loan_request(NUMERIC, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_loan_request_for_member(
  p_member_id UUID,
  p_amount NUMERIC,
  p_loan_type TEXT,
  p_purpose TEXT,
  p_term_months INTEGER,
  p_frequency TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_quote JSONB;
  v_request_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can enter a loan application.';
  END IF;
  IF p_member_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.members
    WHERE id = p_member_id
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Select an active member.';
  END IF;
  IF COALESCE(trim(p_loan_type), '') = '' OR COALESCE(trim(p_purpose), '') = '' THEN
    RAISE EXCEPTION 'Enter the loan type and purpose.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_member_id::TEXT));
  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.member_id = p_member_id
      AND r.request_type = 'loan_application'
      AND (
        r.status IN ('pending', 'under_review')
        OR (
          r.status = 'approved'
          AND EXISTS (
            SELECT 1
            FROM public.loans l
            WHERE l.request_id = r.id
              AND l.status = 'approved'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'This member already has a loan application awaiting a decision or cash release.';
  END IF;

  v_quote := public.loan_quote(p_amount, p_term_months, p_frequency);
  INSERT INTO public.requests (
    request_number, request_type, member_id, requester_id, request_data, amount
  )
  VALUES (
    'LOAN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::TEXT, 1, 6)),
    'loan_application',
    p_member_id,
    v_staff_id,
    jsonb_build_object(
      'type', 'Loan Application',
      'loan_type', left(trim(p_loan_type), 60),
      'purpose', left(trim(p_purpose), 500)
    ) || v_quote,
    p_amount
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_loan_request_for_member(UUID, NUMERIC, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_loan_request_for_member(UUID, NUMERIC, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

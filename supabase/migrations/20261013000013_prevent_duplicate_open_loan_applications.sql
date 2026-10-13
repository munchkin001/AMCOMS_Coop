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
DECLARE
  v_member UUID := public.get_member_id();
  v_staff UUID;
  v_quote JSONB;
  v_id UUID;
BEGIN
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Your member profile could not be verified.';
  END IF;
  IF COALESCE(trim(p_loan_type), '') = '' OR COALESCE(trim(p_purpose), '') = '' THEN
    RAISE EXCEPTION 'Enter the loan type and purpose.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_member::TEXT));
  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.member_id = v_member
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
    RAISE EXCEPTION 'You already have a loan application awaiting a decision or cash release.';
  END IF;

  v_quote := public.loan_quote(p_amount, p_term_months, p_frequency);
  SELECT id INTO v_staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.requests (request_number, request_type, member_id, requester_id, request_data, amount)
  VALUES (
    'LOAN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::TEXT, 1, 6)),
    'loan_application', v_member, v_staff,
    jsonb_build_object(
      'type', 'Loan Application',
      'loan_type', left(trim(p_loan_type), 60),
      'purpose', left(trim(p_purpose), 500)
    ) || v_quote,
    p_amount
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_loan_request(NUMERIC, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_loan_request(NUMERIC, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

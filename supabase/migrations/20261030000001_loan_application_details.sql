CREATE OR REPLACE FUNCTION public.submit_loan_request_for_member_with_details(
  p_member_id UUID,
  p_amount NUMERIC,
  p_loan_type TEXT,
  p_purpose TEXT,
  p_term_months INTEGER,
  p_frequency TEXT,
  p_application_details JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_quote JSONB;
  v_request_id UUID;
  v_details JSONB := COALESCE(p_application_details, '{}'::JSONB);
  v_processing_fee NUMERIC;
  v_service_fee NUMERIC;
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
  IF jsonb_typeof(v_details) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Loan application details must be an object.';
  END IF;
  IF length(COALESCE(v_details ->> 'collateral_type', '')) > 80
     OR length(COALESCE(v_details ->> 'collateral_description', '')) > 300
     OR length(COALESCE(v_details ->> 'guarantor_name', '')) > 160
     OR length(COALESCE(v_details ->> 'guarantor_contact', '')) > 80 THEN
    RAISE EXCEPTION 'Collateral or guarantor details are too long.';
  END IF;
  IF (v_details ? 'processing_fee' AND jsonb_typeof(v_details -> 'processing_fee') NOT IN ('number', 'string'))
     OR (v_details ? 'service_fee' AND jsonb_typeof(v_details -> 'service_fee') NOT IN ('number', 'string')) THEN
    RAISE EXCEPTION 'Loan fees must be valid non-negative amounts.';
  END IF;
  v_processing_fee := COALESCE(NULLIF(v_details ->> 'processing_fee', '')::NUMERIC, 0);
  v_service_fee := COALESCE(NULLIF(v_details ->> 'service_fee', '')::NUMERIC, 0);
  IF v_processing_fee < 0 OR v_service_fee < 0 THEN
    RAISE EXCEPTION 'Loan fees cannot be negative.';
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
      'purpose', left(trim(p_purpose), 500),
      'application_details', jsonb_build_object(
        'collateral_type', NULLIF(trim(COALESCE(v_details ->> 'collateral_type', '')), ''),
        'collateral_description', NULLIF(trim(COALESCE(v_details ->> 'collateral_description', '')), ''),
        'guarantor_name', NULLIF(trim(COALESCE(v_details ->> 'guarantor_name', '')), ''),
        'guarantor_contact', NULLIF(trim(COALESCE(v_details ->> 'guarantor_contact', '')), ''),
        'processing_fee', v_processing_fee,
        'service_fee', v_service_fee
      )
    ) || v_quote,
    p_amount
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_loan_request_for_member_with_details(UUID, NUMERIC, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_loan_request_for_member_with_details(UUID, NUMERIC, TEXT, TEXT, INTEGER, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_bookkeeper_loan_application(
  p_operation_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  member_match_count BIGINT;
  matched_member_id UUID;
  inserted_rows INTEGER;
  existing_type TEXT;
  existing_payload_hash TEXT;
  existing_response JSONB;
  operation_response JSONB;
  request_id UUID;
  member_name TEXT;
  amount NUMERIC;
  loan_type TEXT;
  purpose TEXT;
  term_months_value NUMERIC;
  term_months INTEGER;
  payment_frequency TEXT;
  application_details JSONB;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to synchronize this loan application';
  END IF;
  IF public.current_staff_id() IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can enter a loan application';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A valid operation ID is required';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'A valid loan application payload is required';
  END IF;
  IF jsonb_typeof(p_payload -> 'p_member_name') IS DISTINCT FROM 'string'
     OR (
       jsonb_typeof(p_payload -> 'p_amount') IS DISTINCT FROM 'number'
       AND jsonb_typeof(p_payload -> 'p_amount') IS DISTINCT FROM 'string'
     )
     OR jsonb_typeof(p_payload -> 'p_loan_type') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload -> 'p_purpose') IS DISTINCT FROM 'string'
     OR (
       jsonb_typeof(p_payload -> 'p_term_months') IS DISTINCT FROM 'number'
       AND jsonb_typeof(p_payload -> 'p_term_months') IS DISTINCT FROM 'string'
     )
     OR jsonb_typeof(p_payload -> 'p_frequency') IS DISTINCT FROM 'string'
     OR (
       p_payload ? 'p_application_details'
       AND jsonb_typeof(p_payload -> 'p_application_details') IS DISTINCT FROM 'object'
     ) THEN
    RAISE EXCEPTION 'Loan application details are incomplete';
  END IF;

  member_name := trim(p_payload ->> 'p_member_name');
  amount := (p_payload ->> 'p_amount')::NUMERIC;
  loan_type := trim(p_payload ->> 'p_loan_type');
  purpose := trim(p_payload ->> 'p_purpose');
  term_months_value := (p_payload ->> 'p_term_months')::NUMERIC;
  IF term_months_value <> trunc(term_months_value) THEN
    RAISE EXCEPTION 'Repayment term must be a whole number of months';
  END IF;
  term_months := term_months_value::INTEGER;
  payment_frequency := trim(p_payload ->> 'p_frequency');
  application_details := COALESCE(p_payload -> 'p_application_details', '{}'::JSONB);

  IF member_name = '' OR length(member_name) > 200 THEN
    RAISE EXCEPTION 'Enter the member''s full name';
  END IF;
  IF loan_type = '' OR purpose = '' OR length(loan_type) > 60 OR length(purpose) > 500 THEN
    RAISE EXCEPTION 'Enter a valid loan type and purpose';
  END IF;

  INSERT INTO public.offline_sync_operations (
    user_id, operation_id, operation_type, payload_hash
  )
  VALUES (
    authenticated_user_id, p_operation_id, 'bookkeeper_loan_application', md5(p_payload::TEXT)
  )
  ON CONFLICT (user_id, operation_id) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows = 0 THEN
    SELECT operation_type, response, payload_hash
      INTO existing_type, existing_response, existing_payload_hash
    FROM public.offline_sync_operations
    WHERE user_id = authenticated_user_id
      AND operation_id = p_operation_id;

    IF existing_type <> 'bookkeeper_loan_application' THEN
      RAISE EXCEPTION 'Operation ID was already used for a different operation';
    END IF;
    IF existing_payload_hash IS NOT NULL AND existing_payload_hash <> md5(p_payload::TEXT) THEN
      RAISE EXCEPTION 'Operation ID was already used with different loan details';
    END IF;
    IF existing_response IS NULL THEN
      RAISE EXCEPTION 'The previous loan application is still being processed';
    END IF;

    RETURN existing_response || jsonb_build_object('replayed', true);
  END IF;

  SELECT count(*), (array_agg(m.id))[1]
    INTO member_match_count, matched_member_id
  FROM public.members m
  WHERE m.membership_status = 'active'
    AND m.archived_at IS NULL
    AND lower(regexp_replace(trim(concat_ws(' ', m.first_name, m.middle_name, m.last_name)), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(member_name, '[[:space:]]+', ' ', 'g'));

  IF member_match_count = 0 THEN
    RAISE EXCEPTION 'No active member matches that full name. Check the spelling and try again.';
  END IF;
  IF member_match_count > 1 THEN
    RAISE EXCEPTION 'More than one active member has that full name. Use the member list online to select the correct member.';
  END IF;

  request_id := public.submit_loan_request_for_member_with_details(
    matched_member_id,
    amount,
    loan_type,
    purpose,
    term_months,
    payment_frequency,
    application_details
  );

  operation_response := jsonb_build_object(
    'accepted', true,
    'stored', true,
    'operationId', p_operation_id,
    'replayed', false,
    'result', jsonb_build_object('requestId', request_id),
    'serverConfirmedAt', clock_timestamp()
  );

  UPDATE public.offline_sync_operations
  SET response = operation_response
  WHERE user_id = authenticated_user_id
    AND operation_id = p_operation_id;

  RETURN operation_response;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bookkeeper_loan_application(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_bookkeeper_loan_application(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

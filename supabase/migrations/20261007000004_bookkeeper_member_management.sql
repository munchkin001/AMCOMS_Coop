ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;
CREATE OR REPLACE FUNCTION public.bookkeeper_create_member(
  p_member JSONB,
  p_confirm_possible_duplicate BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_first_name TEXT := trim(COALESCE(p_member->>'first_name', ''));
  v_middle_name TEXT := NULLIF(trim(COALESCE(p_member->>'middle_name', '')), '');
  v_last_name TEXT := trim(COALESCE(p_member->>'last_name', ''));
  v_email TEXT := NULLIF(lower(trim(COALESCE(p_member->>'email', ''))), '');
  v_phone TEXT := NULLIF(trim(COALESCE(p_member->>'phone', '')), '');
  v_date_of_birth DATE := NULLIF(p_member->>'date_of_birth', '')::DATE;
  v_member_count BIGINT;
  v_member_number TEXT;
  v_matches JSONB;
  v_email_conflict BOOLEAN;
  v_member_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can create member records';
  END IF;
  IF v_first_name = '' OR v_last_name = '' THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;
  IF NULLIF(trim(COALESCE(p_member->>'address', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Address is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.members m WHERE v_email IS NOT NULL AND lower(m.email) = v_email
  ) INTO v_email_conflict;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'member_number', candidate.member_number,
    'first_name', candidate.first_name,
    'middle_name', candidate.middle_name,
    'last_name', candidate.last_name,
    'phone', candidate.phone,
    'email', candidate.email,
    'date_of_birth', candidate.date_of_birth,
    'membership_status', candidate.membership_status,
    'date_joined', candidate.date_joined
  )), '[]'::JSONB)
  INTO v_matches
  FROM public.members candidate
  WHERE (v_email IS NOT NULL AND lower(candidate.email) = v_email)
     OR (v_phone IS NOT NULL AND regexp_replace(candidate.phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
     OR (v_date_of_birth IS NOT NULL
         AND lower(trim(candidate.first_name)) = lower(v_first_name)
         AND lower(trim(candidate.last_name)) = lower(v_last_name)
         AND candidate.date_of_birth = v_date_of_birth);

  IF jsonb_array_length(v_matches) > 0 AND NOT p_confirm_possible_duplicate THEN
    RETURN jsonb_build_object(
      'created', false,
      'possible_duplicate', true,
      'email_conflict', v_email_conflict,
      'matches', v_matches
    );
  END IF;
  IF v_email_conflict THEN
    RAISE EXCEPTION 'A member already uses this email address';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('amcoms-member-number')::BIGINT);
  SELECT COUNT(*) INTO v_member_count FROM public.members;
  v_member_number := 'M-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad((v_member_count + 1)::TEXT, 5, '0');

  INSERT INTO public.members (
    member_number, first_name, middle_name, last_name, email, phone, address,
    date_of_birth, gender, membership_type, membership_status, date_joined,
    shares_owned, total_capital, emergency_contact_name, emergency_contact_phone,
    family_members, rsbsa, tin, ncfrs, pca_id, occupation, barangay,
    municipality, province, created_by
  ) VALUES (
    v_member_number,
    v_first_name,
    v_middle_name,
    v_last_name,
    v_email,
    v_phone,
    NULLIF(trim(COALESCE(p_member->>'address', '')), ''),
    v_date_of_birth,
    NULLIF(p_member->>'gender', ''),
    COALESCE(NULLIF(p_member->>'membership_type', ''), 'regular'),
    'active',
    COALESCE(NULLIF(p_member->>'date_joined', '')::DATE, CURRENT_DATE),
    COALESCE(NULLIF(p_member->>'shares_owned', '')::INTEGER, 0),
    COALESCE(NULLIF(p_member->>'total_capital', '')::NUMERIC(15, 2), 0),
    NULLIF(trim(COALESCE(p_member->>'emergency_contact_name', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'emergency_contact_phone', '')), ''),
    COALESCE(p_member->'family_members', '[]'::JSONB),
    NULLIF(trim(COALESCE(p_member->>'rsbsa', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'tin', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'ncfrs', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'pca_id', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'occupation', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'barangay', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'municipality', '')), ''),
    NULLIF(trim(COALESCE(p_member->>'province', '')), ''),
    v_staff_id
  ) RETURNING id INTO v_member_id;

  RETURN jsonb_build_object('created', true, 'id', v_member_id, 'member_number', v_member_number);
END;
$$;
CREATE OR REPLACE FUNCTION public.bookkeeper_update_member(
  p_member_id UUID,
  p_member JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can edit member records';
  END IF;

  UPDATE public.members
  SET first_name = CASE WHEN p_member ? 'first_name' THEN trim(p_member->>'first_name') ELSE first_name END,
      middle_name = CASE WHEN p_member ? 'middle_name' THEN NULLIF(trim(p_member->>'middle_name'), '') ELSE middle_name END,
      last_name = CASE WHEN p_member ? 'last_name' THEN trim(p_member->>'last_name') ELSE last_name END,
      email = CASE WHEN p_member ? 'email' THEN NULLIF(lower(trim(p_member->>'email')), '') ELSE email END,
      phone = CASE WHEN p_member ? 'phone' THEN NULLIF(trim(p_member->>'phone'), '') ELSE phone END,
      address = CASE WHEN p_member ? 'address' THEN NULLIF(trim(p_member->>'address'), '') ELSE address END,
      date_of_birth = CASE WHEN p_member ? 'date_of_birth' THEN NULLIF(p_member->>'date_of_birth', '')::DATE ELSE date_of_birth END,
      gender = CASE WHEN p_member ? 'gender' THEN NULLIF(p_member->>'gender', '') ELSE gender END,
      emergency_contact_name = CASE WHEN p_member ? 'emergency_contact_name' THEN NULLIF(trim(p_member->>'emergency_contact_name'), '') ELSE emergency_contact_name END,
      emergency_contact_phone = CASE WHEN p_member ? 'emergency_contact_phone' THEN NULLIF(trim(p_member->>'emergency_contact_phone'), '') ELSE emergency_contact_phone END,
      family_members = CASE WHEN p_member ? 'family_members' THEN COALESCE(p_member->'family_members', '[]'::JSONB) ELSE family_members END,
      rsbsa = CASE WHEN p_member ? 'rsbsa' THEN NULLIF(trim(p_member->>'rsbsa'), '') ELSE rsbsa END,
      tin = CASE WHEN p_member ? 'tin' THEN NULLIF(trim(p_member->>'tin'), '') ELSE tin END,
      ncfrs = CASE WHEN p_member ? 'ncfrs' THEN NULLIF(trim(p_member->>'ncfrs'), '') ELSE ncfrs END,
      pca_id = CASE WHEN p_member ? 'pca_id' THEN NULLIF(trim(p_member->>'pca_id'), '') ELSE pca_id END,
      occupation = CASE WHEN p_member ? 'occupation' THEN NULLIF(trim(p_member->>'occupation'), '') ELSE occupation END,
      barangay = CASE WHEN p_member ? 'barangay' THEN NULLIF(trim(p_member->>'barangay'), '') ELSE barangay END,
      municipality = CASE WHEN p_member ? 'municipality' THEN NULLIF(trim(p_member->>'municipality'), '') ELSE municipality END,
      province = CASE WHEN p_member ? 'province' THEN NULLIF(trim(p_member->>'province'), '') ELSE province END
  WHERE id = p_member_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id AND (m.first_name = '' OR m.last_name = '' OR m.address IS NULL)
  ) THEN
    RAISE EXCEPTION 'First name, last name, and address are required';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_member_archive_review(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member RECORD;
  v_savings NUMERIC(15, 2);
  v_time_deposit NUMERIC(15, 2);
  v_loan_balance NUMERIC(15, 2);
  v_outstanding_loans INTEGER;
  v_pending_loans INTEGER;
  v_pending_requests INTEGER;
BEGIN
  IF NOT public.has_any_role(ARRAY['bookkeeper', 'manager']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_member FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT COALESCE(SUM(balance), 0) INTO v_savings
  FROM public.savings_accounts WHERE member_id = p_member_id AND account_type = 'regular' AND status = 'active';
  SELECT COALESCE(SUM(balance), 0) INTO v_time_deposit
  FROM public.savings_accounts WHERE member_id = p_member_id AND account_type = 'time_deposit' AND status = 'active';
  SELECT COALESCE(SUM(balance), 0), COUNT(*) FILTER (WHERE balance > 0), COUNT(*) FILTER (WHERE status = 'pending')
    INTO v_loan_balance, v_outstanding_loans, v_pending_loans
  FROM public.loans WHERE member_id = p_member_id AND status IN ('pending', 'approved', 'active');
  SELECT COUNT(*) INTO v_pending_requests
  FROM public.requests WHERE member_id = p_member_id AND status IN ('pending', 'under_review');

  RETURN jsonb_build_object(
    'member', jsonb_build_object(
      'id', v_member.id,
      'member_number', v_member.member_number,
      'first_name', v_member.first_name,
      'middle_name', v_member.middle_name,
      'last_name', v_member.last_name,
      'membership_status', v_member.membership_status,
      'date_joined', v_member.date_joined,
      'total_capital', v_member.total_capital,
      'shares_owned', v_member.shares_owned
    ),
    'savings_balance', v_savings,
    'time_deposit_balance', v_time_deposit,
    'outstanding_loan_balance', v_loan_balance,
    'outstanding_loan_count', v_outstanding_loans,
    'pending_loan_count', v_pending_loans,
    'unresolved_request_count', v_pending_requests,
    'cleared', v_loan_balance <= 0 AND v_pending_loans = 0 AND v_pending_requests = 0
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.bookkeeper_archive_member(p_member_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_review JSONB;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can archive members';
  END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'An archive reason is required';
  END IF;

  v_review := public.get_member_archive_review(p_member_id);
  IF (v_review->>'outstanding_loan_balance')::NUMERIC > 0 THEN
    RAISE EXCEPTION 'Member has outstanding loan obligations. Resolve or authorize them before archiving.';
  END IF;
  IF (v_review->>'pending_loan_count')::INTEGER > 0 THEN
    RAISE EXCEPTION 'Member has a loan application under review. Resolve it before archiving.';
  END IF;
  IF (v_review->>'unresolved_request_count')::INTEGER > 0 THEN
    RAISE EXCEPTION 'Member has unresolved requests. Review them before archiving.';
  END IF;

  UPDATE public.members
  SET membership_status = 'inactive',
      archived_at = timezone('utc'::text, now()),
      archived_by = v_staff_id,
      archive_reason = trim(p_reason)
  WHERE id = p_member_id
    AND membership_status = 'active'
    AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member is not currently active'; END IF;

  RETURN v_review;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bookkeeper_create_member(JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bookkeeper_update_member(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_archive_review(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bookkeeper_archive_member(UUID, TEXT) TO authenticated;

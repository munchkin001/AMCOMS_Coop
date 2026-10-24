CREATE OR REPLACE FUNCTION public.next_member_account_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_number BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('amcoms-member-account-number')::BIGINT);

  SELECT COALESCE(MAX(member_number::BIGINT), 0) + 1
  INTO v_next_number
  FROM (
    SELECT member_number FROM public.members
    UNION ALL
    SELECT member_number FROM public.archived_members
  ) member_numbers
  WHERE member_number ~ '^[0-9]+$';

  RETURN lpad(v_next_number::TEXT, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_member_account_number() FROM PUBLIC, anon, authenticated;

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

  v_member_number := public.next_member_account_number();

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

CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_member_number TEXT;
  new_member_id UUID;
  target_user_id UUID;
  new_full_name TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    new_full_name := concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name);

    target_user_id := NEW.user_id;
    IF target_user_id IS NULL THEN
      SELECT u.id INTO target_user_id
      FROM auth.users u
      WHERE lower(u.email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve: no account exists for %. The applicant must sign up first.', NEW.email;
    END IF;

    NEW.user_id := target_user_id;

    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = target_user_id;

    SELECT id INTO new_member_id
    FROM public.members
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF new_member_id IS NOT NULL THEN
      UPDATE public.members
      SET membership_status = 'active',
          archived_at = NULL,
          updated_at = now()
      WHERE id = new_member_id;
    ELSE
      new_member_number := public.next_member_account_number();

      INSERT INTO public.members (
        member_number,
        first_name, middle_name, last_name,
        email, phone, address,
        barangay, municipality, province,
        date_of_birth, gender, occupation,
        rsbsa, tin, ncfrs, pca_id,
        emergency_contact_name, emergency_contact_phone, family_members,
        membership_type, membership_status, date_joined,
        created_at, updated_at
      ) VALUES (
        new_member_number,
        NEW.first_name, NEW.middle_name, NEW.last_name,
        NEW.email, NEW.phone, NEW.address,
        NEW.barangay, NEW.municipality, NEW.province,
        NEW.date_of_birth, NEW.gender, NEW.occupation,
        NEW.rsbsa, NEW.tin, NEW.ncfrs, NEW.pca_id,
        NEW.emergency_contact_name, NEW.emergency_contact_phone,
        COALESCE(NEW.family_members, '[]'::jsonb),
        'regular', 'active',
        COALESCE(NEW.date_joined, CURRENT_DATE),
        now(), now()
      )
      RETURNING id INTO new_member_id;
    END IF;

    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id, must_change_password
    ) VALUES (
      target_user_id, NEW.email, NEW.email, new_full_name, 'member', true, new_member_id, false
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id = EXCLUDED.member_id,
          role = 'member',
          is_active = true,
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          must_change_password = false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_savings_account_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_number BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('amcoms-savings-account-number')::BIGINT);

  SELECT COALESCE(MAX(account_number::BIGINT), 0) + 1
  INTO v_next_number
  FROM public.savings_accounts
  WHERE account_number ~ '^[0-9]+$';

  RETURN lpad(v_next_number::TEXT, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_savings_account_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._get_or_create_member_savings_account(
  p_member_id UUID,
  p_account_type TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account_id UUID;
  v_account_number TEXT;
BEGIN
  IF p_account_type NOT IN ('regular', 'time_deposit') THEN
    RAISE EXCEPTION 'Unsupported member savings account type';
  END IF;

  PERFORM 1 FROM public.members WHERE id = p_member_id FOR UPDATE;
  SELECT id INTO v_account_id
  FROM public.savings_accounts
  WHERE member_id = p_member_id AND account_type = p_account_type AND status = 'active'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_account_number := public.next_savings_account_number();

  INSERT INTO public.savings_accounts (account_number, member_id, account_type)
  VALUES (v_account_number, p_member_id, p_account_type)
  RETURNING id INTO v_account_id;
  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_sequential_savings_account_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.account_number ~ '^(SAV-|TD-)' THEN
    NEW.account_number := public.next_savings_account_number();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_sequential_savings_account_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS savings_accounts_sequential_account_number ON public.savings_accounts;
CREATE TRIGGER savings_accounts_sequential_account_number
  BEFORE INSERT ON public.savings_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_sequential_savings_account_number();

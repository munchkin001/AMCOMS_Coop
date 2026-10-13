BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS auth_email TEXT;

ALTER TABLE public.staff
  ALTER COLUMN email DROP NOT NULL;

UPDATE public.staff AS s
SET auth_email = u.email
FROM auth.users AS u
WHERE u.id = s.user_id
  AND s.auth_email IS NULL;

UPDATE public.staff AS s
SET email = NULLIF(lower(btrim(m.email)), '')
FROM public.members AS m
WHERE m.id = s.member_id
  AND s.role = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS staff_auth_email_unique
  ON public.staff (lower(auth_email))
  WHERE auth_email IS NOT NULL;

DROP TRIGGER IF EXISTS sync_confirmed_auth_email_to_profiles ON auth.users;

CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.auth_email, s.is_active
  FROM public.staff AS s
  WHERE lower(btrim(s.username)) = lower(btrim(coalesce(p_identifier, '')))
    AND btrim(coalesce(p_identifier, '')) <> ''
    AND s.auth_email IS NOT NULL
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bookkeeper_link_member_auth(
  p_member_id UUID,
  p_auth_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_id UUID := public.current_staff_id();
  v_member public.members%ROWTYPE;
  v_auth_email TEXT;
  v_expected_email TEXT;
  v_existing_staff public.staff%ROWTYPE;
  v_staff_id UUID;
  v_full_name TEXT;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can create member portal accounts';
  END IF;

  SELECT * INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.membership_status <> 'active' OR v_member.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active member record is required for portal access';
  END IF;

  SELECT lower(email) INTO v_auth_email
  FROM auth.users
  WHERE id = p_auth_user_id;
  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'The authentication account must have a login identifier';
  END IF;

  v_expected_email := lower(v_member.id::TEXT || '@members.amcoms.invalid');
  IF v_auth_email <> v_expected_email THEN
    RAISE EXCEPTION 'The authentication login does not match the member account';
  END IF;

  SELECT * INTO v_existing_staff
  FROM public.staff
  WHERE user_id = p_auth_user_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_staff.role <> 'member'
       OR (v_existing_staff.member_id IS NOT NULL AND v_existing_staff.member_id <> p_member_id) THEN
      RAISE EXCEPTION 'This authentication account is already linked to another profile';
    END IF;
    v_staff_id := v_existing_staff.id;
    UPDATE public.staff
    SET member_id = p_member_id,
        role = 'member',
        is_active = true,
        must_change_password = true,
        full_name = concat_ws(' ', v_member.first_name, v_member.middle_name, v_member.last_name),
        email = NULLIF(lower(btrim(v_member.email)), ''),
        auth_email = v_auth_email,
        username = COALESCE(NULLIF(btrim(v_existing_staff.username), ''), v_member.member_number),
        updated_at = timezone('utc'::TEXT, now())
    WHERE id = v_staff_id;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.staff
      WHERE lower(username) = lower(v_member.member_number)
    ) THEN
      RAISE EXCEPTION 'The member number is already associated with another account';
    END IF;

    v_full_name := concat_ws(' ', v_member.first_name, v_member.middle_name, v_member.last_name);
    INSERT INTO public.staff (
      user_id, username, email, auth_email, full_name, role, is_active, member_id, must_change_password
    ) VALUES (
      p_auth_user_id, v_member.member_number, NULLIF(lower(btrim(v_member.email)), ''),
      v_auth_email, v_full_name, 'member', true, p_member_id, true
    )
    RETURNING id INTO v_staff_id;
  END IF;

  RETURN jsonb_build_object('staff_id', v_staff_id, 'must_change_password', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_profile JSONB)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  actor public.staff%ROWTYPE;
  profile_email TEXT := NULLIF(lower(trim(p_profile ->> 'email')), '');
  first_name_value TEXT := trim(p_profile ->> 'first_name');
  middle_name_value TEXT := NULLIF(trim(p_profile ->> 'middle_name'), '');
  last_name_value TEXT := trim(p_profile ->> 'last_name');
  username_value TEXT := lower(trim(p_profile ->> 'username'));
  full_name_value TEXT;
  date_of_birth_value DATE := NULLIF(trim(p_profile ->> 'date_of_birth'), '')::DATE;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to update a profile';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'A valid profile is required';
  END IF;
  IF first_name_value IS NULL OR first_name_value = ''
     OR last_name_value IS NULL OR last_name_value = '' THEN
    RAISE EXCEPTION 'First and last name are required';
  END IF;
  IF username_value IS NULL OR username_value !~ '^[a-z0-9._]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers, dots, and underscores';
  END IF;
  IF profile_email IS NOT NULL
     AND profile_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid contact email address or leave it blank';
  END IF;
  IF date_of_birth_value > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  SELECT s.* INTO actor
  FROM public.staff AS s
  WHERE s.user_id = authenticated_user_id
    AND s.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active staff or member profile is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff AS s
    WHERE lower(s.username) = username_value
      AND s.id <> actor.id
  ) THEN
    RAISE EXCEPTION 'This username is already taken. Please choose a different one';
  END IF;

  full_name_value := concat_ws(' ', first_name_value, middle_name_value, last_name_value);

  IF actor.role = 'member' THEN
    IF actor.member_id IS NULL THEN
      RAISE EXCEPTION 'The member profile is not linked';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.members AS m
      WHERE m.id = actor.member_id
        AND m.membership_status = 'active'
        AND m.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Only active members can update their profiles';
    END IF;

    UPDATE public.members
    SET first_name = first_name_value,
        middle_name = middle_name_value,
        last_name = last_name_value,
        email = profile_email,
        phone = NULLIF(trim(p_profile ->> 'phone'), ''),
        address = NULLIF(trim(p_profile ->> 'address'), ''),
        date_of_birth = date_of_birth_value,
        emergency_contact_name = NULLIF(trim(p_profile ->> 'emergency_contact_name'), ''),
        emergency_contact_phone = NULLIF(trim(p_profile ->> 'emergency_contact_phone'), ''),
        emergency_contact_relationship = NULLIF(trim(p_profile ->> 'emergency_contact_relationship'), ''),
        additional_emergency_contacts = CASE
          WHEN jsonb_typeof(p_profile -> 'additional_emergency_contacts') = 'array'
          THEN p_profile -> 'additional_emergency_contacts'
          ELSE '[]'::JSONB
        END
    WHERE id = actor.member_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The linked member profile could not be found';
    END IF;
  END IF;

  UPDATE public.staff
  SET first_name = first_name_value,
      middle_name = middle_name_value,
      last_name = last_name_value,
      full_name = full_name_value,
      username = username_value,
      email = profile_email,
      phone = NULLIF(trim(p_profile ->> 'phone'), ''),
      address = NULLIF(trim(p_profile ->> 'address'), ''),
      date_of_birth = date_of_birth_value,
      emergency_contact_name = NULLIF(trim(p_profile ->> 'emergency_contact_name'), ''),
      emergency_contact_phone = NULLIF(trim(p_profile ->> 'emergency_contact_phone'), ''),
      emergency_contact_relationship = NULLIF(trim(p_profile ->> 'emergency_contact_relationship'), ''),
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = actor.id;

  UPDATE auth.users
  SET raw_user_meta_data = (
    COALESCE(raw_user_meta_data, '{}'::JSONB) - 'display_name'
  ) || jsonb_build_object('full_name', full_name_value)
  WHERE id = authenticated_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

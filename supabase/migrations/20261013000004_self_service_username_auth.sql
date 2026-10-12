BEGIN;

CREATE TEMP TABLE staff_username_migration_map ON COMMIT DROP AS
SELECT id, lower(username) AS username
FROM public.staff;

UPDATE public.staff AS account
SET username = 'tmp.' || lpad(numbered.row_number::text, 26, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY id) AS row_number
  FROM public.staff
) AS numbered
WHERE account.id = numbered.id;

DO $$
DECLARE
  account RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR account IN
    SELECT id, username
    FROM staff_username_migration_map
    ORDER BY id
  LOOP
    candidate := left(account.username, 30);
    suffix := 1;

    WHILE EXISTS (
      SELECT 1
      FROM public.staff
      WHERE lower(username) = candidate
        AND id <> account.id
    ) LOOP
      candidate := left(account.username, 29 - length(suffix::text))
        || '.'
        || suffix::text;
      suffix := suffix + 1;
    END LOOP;

    UPDATE public.staff
    SET username = candidate
    WHERE id = account.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_username_lower_unique_idx
  ON public.staff (lower(username));

UPDATE auth.users AS auth_user
SET raw_user_meta_data = (
  COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb) - 'display_name'
) || jsonb_build_object('full_name', staff.full_name)
FROM public.staff AS staff
WHERE staff.user_id = auth_user.id;

CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT lower(regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', ' ', 'g')) AS value
  ),
  username_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff s
    CROSS JOIN normalized n
    WHERE n.value <> ''
      AND lower(s.username) = n.value
  ),
  name_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff s
    CROSS JOIN normalized n
    WHERE n.value <> ''
      AND lower(regexp_replace(btrim(s.full_name), '\s+', ' ', 'g')) = n.value
  )
  SELECT login_match.email, login_match.is_active
  FROM (
    SELECT um.email, um.is_active
    FROM username_matches um
    UNION ALL
    SELECT nm.email, nm.is_active
    FROM name_matches nm
    WHERE NOT EXISTS (SELECT 1 FROM username_matches)
  ) AS login_match
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

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
  authenticated_email TEXT;
  profile_email TEXT := lower(trim(p_profile ->> 'email'));
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
  IF profile_email IS NULL OR profile_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  SELECT u.email INTO authenticated_email
  FROM auth.users u
  WHERE u.id = authenticated_user_id;
  IF lower(authenticated_email) <> profile_email THEN
    RAISE EXCEPTION 'The profile email must match the verified account email';
  END IF;
  IF date_of_birth_value > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  SELECT s.* INTO actor
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id
    AND s.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active staff or member profile is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff s
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
      FROM public.members m
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
          ELSE '[]'::jsonb
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
      updated_at = timezone('utc'::text, now())
  WHERE id = actor.id;

  UPDATE auth.users
  SET raw_user_meta_data = (
    COALESCE(raw_user_meta_data, '{}'::jsonb) - 'display_name'
  ) || jsonb_build_object('full_name', full_name_value)
  WHERE id = authenticated_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(JSONB) TO authenticated;
COMMENT ON FUNCTION public.update_own_profile(JSONB) IS
  'Allows an authenticated active staff or member to update their own profile, full name, and unique username.';

NOTIFY pgrst, 'reload schema';

COMMIT;

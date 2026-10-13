BEGIN;

CREATE OR REPLACE FUNCTION public.validate_username(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN p_username ~ '^[a-zA-Z0-9._-]{3,30}$';
END;
$$;

COMMENT ON FUNCTION public.validate_username IS
  'Validates usernames: 3-30 characters, alphanumeric with dots, underscores, or hyphens';

CREATE OR REPLACE FUNCTION public.bookkeeper_update_member_username(
  p_member_id UUID,
  p_username TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  username_value TEXT := lower(trim(p_username));
  member_staff public.staff%ROWTYPE;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can update member usernames';
  END IF;
  IF username_value IS NULL OR username_value !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens';
  END IF;

  SELECT s.* INTO member_staff
  FROM public.staff AS s
  WHERE s.member_id = p_member_id
    AND s.role = 'member'
    AND s.user_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No linked member portal account was found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff AS s
    WHERE lower(s.username) = username_value
      AND s.id <> member_staff.id
  ) THEN
    RAISE EXCEPTION 'This username is already taken';
  END IF;

  UPDATE public.staff
  SET username = username_value,
      updated_at = timezone('utc'::TEXT, now())
  WHERE id = member_staff.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_update_member_username(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_update_member_username(UUID, TEXT) TO authenticated;

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
  IF username_value IS NULL OR username_value !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens';
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

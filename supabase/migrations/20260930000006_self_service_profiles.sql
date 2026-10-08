ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
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

  IF profile_email IS NULL OR profile_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  SELECT u.email
    INTO authenticated_email
  FROM auth.users u
  WHERE u.id = authenticated_user_id;

  IF lower(authenticated_email) <> profile_email THEN
    RAISE EXCEPTION 'The profile email must match the verified account email';
  END IF;

  IF date_of_birth_value > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  SELECT s.*
    INTO actor
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id
    AND s.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active staff or member profile is required';
  END IF;

  IF actor.role = 'member' THEN
    IF actor.member_id IS NULL THEN
      RAISE EXCEPTION 'The member profile is not linked';
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
        emergency_contact_relationship = NULLIF(trim(p_profile ->> 'emergency_contact_relationship'), '')
    WHERE id = actor.member_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The linked member profile could not be found';
    END IF;
  END IF;

  UPDATE public.staff
  SET first_name = first_name_value,
      middle_name = middle_name_value,
      last_name = last_name_value,
      full_name = concat_ws(' ', first_name_value, middle_name_value, last_name_value),
      email = profile_email,
      phone = NULLIF(trim(p_profile ->> 'phone'), ''),
      address = NULLIF(trim(p_profile ->> 'address'), ''),
      date_of_birth = date_of_birth_value,
      emergency_contact_name = NULLIF(trim(p_profile ->> 'emergency_contact_name'), ''),
      emergency_contact_phone = NULLIF(trim(p_profile ->> 'emergency_contact_phone'), ''),
      emergency_contact_relationship = NULLIF(trim(p_profile ->> 'emergency_contact_relationship'), ''),
      updated_at = now()
  WHERE id = actor.id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_own_profile(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(JSONB) TO authenticated;
COMMENT ON FUNCTION public.update_own_profile(JSONB) IS
  'Allows an authenticated active staff or member to update only their own profile; member details are synchronized through the linked member_id.';

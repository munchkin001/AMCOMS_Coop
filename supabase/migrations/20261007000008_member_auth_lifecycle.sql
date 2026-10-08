ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
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
  v_existing_staff public.staff%ROWTYPE;
  v_staff_id UUID;
  v_full_name TEXT;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can create member portal accounts';
  END IF;

  SELECT * INTO v_member FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR v_member.membership_status <> 'active' OR v_member.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active member record is required for portal access';
  END IF;
  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RAISE EXCEPTION 'A registered email address is required for portal setup';
  END IF;

  SELECT lower(email) INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
  IF v_auth_email IS NULL OR v_auth_email <> lower(v_member.email) THEN
    RAISE EXCEPTION 'The authentication email must match the registered member email';
  END IF;

  SELECT * INTO v_existing_staff FROM public.staff WHERE user_id = p_auth_user_id FOR UPDATE;
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
        email = v_member.email,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_staff_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.staff WHERE lower(email) = lower(v_member.email)) THEN
      RAISE EXCEPTION 'This email is already associated with a staff account';
    END IF;
    v_full_name := concat_ws(' ', v_member.first_name, v_member.middle_name, v_member.last_name);
    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id, must_change_password
    ) VALUES (
      p_auth_user_id, v_member.member_number, v_member.email, v_full_name,
      'member', true, p_member_id, true
    ) RETURNING id INTO v_staff_id;
  END IF;

  RETURN jsonb_build_object('staff_id', v_staff_id, 'must_change_password', true);
END;
$$;
REVOKE ALL ON FUNCTION public.bookkeeper_link_member_auth(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_link_member_auth(UUID, UUID) TO authenticated;
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
  v_current_email TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can edit member records';
  END IF;

  SELECT lower(email) INTO v_current_email FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF p_member ? 'email' AND lower(NULLIF(trim(p_member->>'email'), '')) IS DISTINCT FROM v_current_email THEN
    RAISE EXCEPTION 'Email changes require a separate verified account update';
  END IF;

  UPDATE public.members
  SET first_name = CASE WHEN p_member ? 'first_name' THEN trim(p_member->>'first_name') ELSE first_name END,
      middle_name = CASE WHEN p_member ? 'middle_name' THEN NULLIF(trim(p_member->>'middle_name'), '') ELSE middle_name END,
      last_name = CASE WHEN p_member ? 'last_name' THEN trim(p_member->>'last_name') ELSE last_name END,
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
  WHERE id = p_member_id
    AND membership_status IN ('active', 'suspended')
    AND archived_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Member is archived or does not exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id AND (m.first_name = '' OR m.last_name = '' OR m.address IS NULL)
  ) THEN
    RAISE EXCEPTION 'First name, last name, and address are required';
  END IF;
END;
$$;
DROP POLICY IF EXISTS "Members can create requests" ON public.requests;
CREATE POLICY "Members can create requests"
  ON public.requests FOR INSERT
  WITH CHECK (
    member_id = public.get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_id AND m.membership_status = 'active'
    )
  );
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
  IF authenticated_user_id IS NULL THEN RAISE EXCEPTION 'Authentication is required to update a profile'; END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN RAISE EXCEPTION 'A valid profile is required'; END IF;
  IF first_name_value IS NULL OR first_name_value = '' OR last_name_value IS NULL OR last_name_value = '' THEN
    RAISE EXCEPTION 'First and last name are required';
  END IF;
  IF profile_email IS NULL OR profile_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  SELECT u.email INTO authenticated_email FROM auth.users u WHERE u.id = authenticated_user_id;
  IF lower(authenticated_email) <> profile_email THEN
    RAISE EXCEPTION 'The profile email must match the verified account email';
  END IF;
  IF date_of_birth_value > CURRENT_DATE THEN RAISE EXCEPTION 'Date of birth cannot be in the future'; END IF;

  SELECT s.* INTO actor
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id AND s.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active staff or member profile is required'; END IF;

  IF actor.role = 'member' THEN
    IF actor.member_id IS NULL THEN RAISE EXCEPTION 'The member profile is not linked'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.members
      WHERE id = actor.member_id
        AND (membership_status = 'inactive' OR archived_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'Archived member profiles are read-only';
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
    IF NOT FOUND THEN RAISE EXCEPTION 'The linked member profile could not be found'; END IF;
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

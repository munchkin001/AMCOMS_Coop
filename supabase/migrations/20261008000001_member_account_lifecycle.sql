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
  actor_id UUID := public.current_staff_id();
  member_record public.members%ROWTYPE;
  auth_email TEXT;
  existing_staff public.staff%ROWTYPE;
  linked_staff_id UUID;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can create member accounts';
  END IF;

  SELECT * INTO member_record
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND OR member_record.membership_status <> 'active' OR member_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active member record is required';
  END IF;
  IF member_record.email IS NULL OR btrim(member_record.email) = '' THEN
    RAISE EXCEPTION 'A registered email is required for portal access';
  END IF;

  SELECT lower(u.email) INTO auth_email
  FROM auth.users u
  WHERE u.id = p_auth_user_id;
  IF auth_email IS NULL OR auth_email <> lower(member_record.email) THEN
    RAISE EXCEPTION 'The authentication email must match the member email';
  END IF;

  SELECT * INTO existing_staff
  FROM public.staff
  WHERE user_id = p_auth_user_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing_staff.role <> 'member'
       OR (existing_staff.member_id IS NOT NULL AND existing_staff.member_id <> p_member_id) THEN
      RAISE EXCEPTION 'This authentication account is already linked to another profile';
    END IF;
    linked_staff_id := existing_staff.id;
    UPDATE public.staff
    SET member_id = p_member_id,
        role = 'member',
        is_active = true,
        must_change_password = true,
        email = member_record.email,
        full_name = concat_ws(' ', member_record.first_name, member_record.middle_name, member_record.last_name),
        updated_at = timezone('utc'::text, now())
    WHERE id = linked_staff_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.staff s
      WHERE lower(s.email) = lower(member_record.email)
        AND (s.role <> 'member' OR s.member_id IS DISTINCT FROM p_member_id)
    ) THEN
      RAISE EXCEPTION 'This email is already associated with another AMCOMS account';
    END IF;
    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id, must_change_password
    ) VALUES (
      p_auth_user_id,
      member_record.member_number,
      member_record.email,
      concat_ws(' ', member_record.first_name, member_record.middle_name, member_record.last_name),
      'member', true, p_member_id, true
    ) RETURNING id INTO linked_staff_id;
  END IF;

  RETURN jsonb_build_object('staff_id', linked_staff_id, 'must_change_password', true);
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_link_member_auth(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_link_member_auth(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.disable_archived_member_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id UUID := public.current_staff_id();
BEGIN
  IF NEW.membership_status = 'inactive' OR NEW.archived_at IS NOT NULL THEN
    UPDATE public.staff
    SET is_active = false,
        updated_at = timezone('utc'::text, now())
    WHERE member_id = NEW.id
      AND role = 'member'
      AND is_active = true;

    IF FOUND THEN
      INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
      SELECT actor_id, 'MEMBER_ACCOUNT_DISABLED', 'member_authentication', NEW.id,
             jsonb_build_object('event', 'MEMBER_ACCOUNT_DISABLED', 'member_number', NEW.member_number);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS disable_member_login_after_archive ON public.members;
CREATE TRIGGER disable_member_login_after_archive
  AFTER UPDATE OF membership_status, archived_at ON public.members
  FOR EACH ROW
  WHEN (NEW.membership_status = 'inactive' OR NEW.archived_at IS NOT NULL)
  EXECUTE FUNCTION public.disable_archived_member_login();

UPDATE public.staff s
SET is_active = false,
    updated_at = timezone('utc'::text, now())
FROM public.members m
WHERE s.member_id = m.id
  AND s.role = 'member'
  AND s.is_active = true
  AND (m.membership_status = 'inactive' OR m.archived_at IS NOT NULL);

DROP POLICY IF EXISTS "Members can create requests" ON public.requests;
CREATE POLICY "Members can create requests"
  ON public.requests FOR INSERT
  WITH CHECK (
    member_id = public.get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_id
        AND m.membership_status = 'active'
        AND m.archived_at IS NULL
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
    IF NOT EXISTS (
      SELECT 1 FROM public.members m
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

CREATE OR REPLACE FUNCTION public.record_auth_event(p_event TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  actor_staff_id UUID;
  normalized_event TEXT := lower(trim(p_event));
  action_label TEXT;
BEGIN
  IF normalized_event NOT IN ('sign in', 'sign out', 'password changed', 'password reset completed') THEN
    RAISE EXCEPTION 'Unsupported authentication audit event';
  END IF;
  IF authenticated_user_id IS NULL THEN RAISE EXCEPTION 'Authentication is required to record this event'; END IF;

  SELECT s.id INTO actor_staff_id
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id AND s.is_active = true
  LIMIT 1;
  IF actor_staff_id IS NULL THEN RAISE EXCEPTION 'An active account is required to record this event'; END IF;

  action_label := CASE normalized_event
    WHEN 'sign in' THEN 'Signed in'
    WHEN 'sign out' THEN 'Signed out'
    WHEN 'password changed' THEN 'PASSWORD_CHANGED'
    ELSE 'PASSWORD_RESET_COMPLETED'
  END;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, user_agent)
  VALUES (
    actor_staff_id,
    action_label,
    'authentication',
    authenticated_user_id,
    jsonb_build_object('event', normalized_event),
    NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
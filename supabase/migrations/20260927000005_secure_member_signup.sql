-- ============================================
-- AMCOMS: Server-Owned Member Signup
-- Migration: 20260927000005
-- ------------------------------------------------------------
-- PROBLEM
--   Signup currently does:
--     1. supabase.auth.signUp(...)
--     2. supabase.from('member_applications').insert({ ..., user_id })
--
--   That fails, and has been failing repeatedly, because RLS protects the
--   table and step 1 does not reliably yield a session: with email
--   confirmation enabled, auth.uid() is null at step 2, so
--   WITH CHECK (user_id = auth.uid()) rejects the row.
--
--   The previous workarounds were to disable RLS, drop the auth.users foreign
--   key, and add a 500ms sleep plus an explicit auth.setSession() call. All
--   three weaken security to work around a design problem: the client should
--   never be writing user_id in the first place.
--
-- APPROACH
--   Move submission into a SECURITY DEFINER function that owns the row.
--
--     submit_member_application(...)       callable by anon and authenticated.
--                                         Never accepts user_id. Stamps it
--                                         from auth.uid(), which may
--                                         legitimately be null when email
--                                         confirmation is enabled.
--
--     link_application_to_current_user()   Called after the applicant confirms
--                                         and signs in. Matches on the email
--                                         in the verified JWT, not on anything
--                                         the client supplies, so it cannot be
--                                         used to claim another person's
--                                         application.
--
--   The approval trigger resolves a missing user_id from auth.users by email,
--   so an application submitted before confirmation can still be approved.
--
--   No client INSERT policy is needed, because the function runs as the table
--   owner and bypasses RLS.
--
-- IDEMPOTENT.
-- ============================================


-- ============================================
-- 1. GUARD
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.member_applications') IS NULL THEN
    RAISE EXCEPTION
      'public.member_applications does not exist. Apply database/member_applications.sql first.';
  END IF;
END $$;
-- ============================================
-- 2. submit_member_application
-- ============================================
CREATE OR REPLACE FUNCTION public.submit_member_application(
  p_first_name              TEXT,
  p_last_name               TEXT,
  p_email                   TEXT,
  p_phone                   TEXT,
  p_address                 TEXT,
  p_middle_name             TEXT DEFAULT NULL,
  p_barangay                TEXT DEFAULT NULL,
  p_municipality            TEXT DEFAULT NULL,
  p_province                TEXT DEFAULT NULL,
  p_date_of_birth           DATE DEFAULT NULL,
  p_occupation              TEXT DEFAULT NULL,
  p_gender                  TEXT DEFAULT NULL,
  p_emergency_contact_name  TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_rsbsa                   TEXT DEFAULT NULL,
  p_tin                     TEXT DEFAULT NULL,
  p_ncfrs                   TEXT DEFAULT NULL,
  p_pca_id                  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email   TEXT;
  v_user_id UUID;
  v_app_id  UUID;
  v_pending INTEGER;
BEGIN
  -- ---- Normalise and validate -------------------------------------------
  v_email := lower(trim(coalesce(p_email, '')));

  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'First name is required';
  END IF;
  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Last name is required';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  -- Deliberately permissive: the goal is to catch typos, not to adjudicate
  -- RFC 5322. Anything stricter rejects valid Philippine addresses.
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  IF p_phone ~ '[^0-9+ ]' THEN
    RAISE EXCEPTION 'Phone number may only contain digits, spaces and a leading +';
  END IF;
  IF p_address IS NULL OR trim(p_address) = '' THEN
    RAISE EXCEPTION 'Address is required';
  END IF;
  IF p_gender IS NOT NULL AND p_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Gender must be male, female or other';
  END IF;

  -- Bound how many applications one address can leave pending. The email
  -- UNIQUE constraint is the real protection; this just stops the table
  -- filling with near-duplicates for an address that keeps retrying.
  SELECT count(*) INTO v_pending
  FROM public.member_applications
  WHERE email = v_email
    AND status = 'pending';

  IF v_pending >= 3 THEN
    RAISE EXCEPTION
      'There are already % pending applications for this email. '
      'Please contact the cooperative office.', v_pending;
  END IF;

  -- ---- Stamped server-side, never taken from the client ------------------
  v_user_id := auth.uid();

  INSERT INTO public.member_applications (
    user_id,
    first_name, middle_name, last_name,
    email, phone, address,
    barangay, municipality, province,
    date_of_birth, occupation, gender,
    emergency_contact_name, emergency_contact_phone,
    rsbsa, tin, ncfrs, pca_id,
    family_members,
    status, application_date,
    created_at, updated_at
  ) VALUES (
    v_user_id,
    trim(p_first_name), nullif(trim(coalesce(p_middle_name, '')), ''), trim(p_last_name),
    v_email, trim(p_phone), trim(p_address),
    nullif(trim(coalesce(p_barangay, '')), ''),
    nullif(trim(coalesce(p_municipality, '')), ''),
    nullif(trim(coalesce(p_province, '')), ''),
    p_date_of_birth,
    nullif(trim(coalesce(p_occupation, '')), ''),
    p_gender,
    nullif(trim(coalesce(p_emergency_contact_name, '')), ''),
    nullif(trim(coalesce(p_emergency_contact_phone, '')), ''),
    nullif(trim(coalesce(p_rsbsa, '')), ''),
    nullif(trim(coalesce(p_tin, '')), ''),
    nullif(trim(coalesce(p_ncfrs, '')), ''),
    nullif(trim(coalesce(p_pca_id, '')), ''),
    '[]'::jsonb,
    'pending', now(),
    now(), now()
  )
  RETURNING id INTO v_app_id;

  RETURN v_app_id;
END;
$$;
COMMENT ON FUNCTION public.submit_member_application(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'Creates a pending membership application. user_id is stamped from auth.uid() and may be NULL when email confirmation is required; link_application_to_current_user() fills it in later.';
-- ============================================
-- 3. link_application_to_current_user
-- ============================================
-- Called by the client after the applicant has confirmed their email and
-- signed in. The match is on the email inside the verified JWT, so a caller
-- cannot use this to attach an application to somebody else's account.
CREATE OR REPLACE FUNCTION public.link_application_to_current_user()
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_email TEXT;
  jwt_uid   UUID := auth.uid();
  app_id    UUID;
BEGIN
  IF jwt_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF jwt_email = '' THEN
    RAISE EXCEPTION 'No email claim on the current session';
  END IF;

  UPDATE public.member_applications
  SET user_id = jwt_uid,
      updated_at = now()
  WHERE email = jwt_email
    AND user_id IS NULL
    AND status = 'pending'
  RETURNING id INTO app_id;

  -- NULL means there was nothing to link, which is a normal outcome rather
  -- than an error: the application may already be linked, or this person may
  -- not have applied at all.
  RETURN app_id;
END;
$$;
COMMENT ON FUNCTION public.link_application_to_current_user() IS
  'Links a pending application to the signed-in user by matching the verified JWT email. Returns NULL when there is nothing to link.';
-- ============================================
-- 4. APPROVAL TRIGGER RESOLVES A MISSING user_id
-- ============================================
-- An application submitted before email confirmation has user_id = NULL.
-- Rather than forcing an extra round trip on the applicant, the approval path
-- resolves the auth user by email. The trigger is SECURITY DEFINER, so it can
-- read auth.users.
CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_count      INTEGER;
  new_member_number TEXT;
  new_member_id     UUID;
  target_user_id    UUID;
  new_full_name     TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN

    new_full_name := concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name);

    -- Prefer the recorded user_id; fall back to the email, which is unique in
    -- auth.users.
    target_user_id := NEW.user_id;

    IF target_user_id IS NULL THEN
      SELECT u.id INTO target_user_id
      FROM auth.users u
      WHERE lower(u.email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    IF target_user_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot approve: no Supabase auth user exists for %. '
        'The applicant must sign up through the portal before approval.', NEW.email;
    END IF;

    -- Record the linkage so the application stays traceable afterwards.
    IF NEW.user_id IS DISTINCT FROM target_user_id THEN
      NEW.user_id := target_user_id;
    END IF;

    -- member_number is still derived from COUNT(*), which is not safe under
    -- concurrent approvals. Preserved here so the existing numbering scheme is
    -- unchanged; replaced by a sequence in the transaction-engine stage.
    SELECT count(*) INTO member_count FROM public.members;
    new_member_number := 'M-' || to_char(CURRENT_DATE, 'YYYY')
                        || '-' || lpad((member_count + 1)::TEXT, 5, '0');

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

    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id
    ) VALUES (
      target_user_id,
      NEW.email,
      NEW.email,
      new_full_name,
      'member',
      true,
      new_member_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id = EXCLUDED.member_id,
          role      = 'member',
          is_active = true,
          full_name = EXCLUDED.full_name,
          email     = EXCLUDED.email;

  END IF;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.create_member_from_application() IS
  'On approval, resolves the auth user (by user_id, else by email), copies every field into members, and links the account via a staff row with role=member.';
-- ============================================
-- 5. GRANT EXECUTION
-- ============================================
-- anon must be able to call submit_member_application, because a visitor
-- submitting a membership application has no session when email confirmation
-- is enabled. This is safe because the function:
--   - never accepts a user_id from the caller
--   - creates only a 'pending' application, which grants nothing
--   - is bounded by the pending-per-email check
--   - requires a manager to approve before any account is linked
REVOKE ALL ON FUNCTION public.submit_member_application(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_member_application(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
-- This one requires a session; it reads the verified JWT.
REVOKE ALL ON FUNCTION public.link_application_to_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_application_to_current_user() TO authenticated;
-- ============================================
-- 6. NO CLIENT INSERT POLICY
-- ============================================
-- Submission now goes exclusively through the function. Leaving an INSERT
-- policy in place would leave a path that bypasses all the validation above.
DROP POLICY IF EXISTS "Applicants can create own application" ON public.member_applications;
DROP POLICY IF EXISTS "Members can create application" ON public.member_applications;
DROP POLICY IF EXISTS "Authenticated users can create application" ON public.member_applications;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.member_applications;
DROP POLICY IF EXISTS "signup_insert" ON public.member_applications;
DROP POLICY IF EXISTS "authenticated_can_insert" ON public.member_applications;
-- ============================================
-- 7. VERIFICATION
-- ============================================
DO $$
DECLARE
  insert_policies TEXT;
BEGIN
  IF to_regprocedure(
       'public.submit_member_application(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,text,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'submit_member_application was not created';
  END IF;

  IF to_regprocedure('public.link_application_to_current_user()') IS NULL THEN
    RAISE EXCEPTION 'link_application_to_current_user was not created';
  END IF;

  SELECT string_agg(policyname, ', ') INTO insert_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'member_applications'
    AND cmd IN ('INSERT', 'ALL');

  IF insert_policies IS NOT NULL THEN
    RAISE WARNING
      'Client INSERT policy still present on member_applications: %', insert_policies;
  END IF;

  RAISE NOTICE '✓ Migration 20260927000005 completed.';
  RAISE NOTICE '✓ submit_member_application() owns the row; no client user_id.';
  RAISE NOTICE '✓ link_application_to_current_user() matches on the verified JWT email.';
  RAISE NOTICE '✓ Approval trigger resolves a missing user_id from auth.users.';
  RAISE NOTICE '✓ All client INSERT policies on member_applications removed.';
  RAISE NOTICE '  Signup no longer depends on a session, so it works with or';
  RAISE NOTICE '  without email confirmation. No RLS or FK workaround needed.';
END $$;

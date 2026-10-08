-- ============================================
-- AMCOMS: Carry Member Application Fields Into members
-- Migration: 20260927000004
-- ------------------------------------------------------------
-- 20260926000001 added nine columns to public.member_applications:
--   gender, emergency_contact_name, emergency_contact_phone,
--   family_members, date_joined, rsbsa, tin, ncfrs, pca_id
--
-- But the create_member_from_application() trigger it also rewrote transfers
-- only `gender` and `date_joined` into public.members. The other seven are
-- collected by the signup form, stored, and then silently discarded at the
-- moment of approval.
--
--   RSBSA   - Rural-based Small-scale Agricultural identification. Commonly
--             required for agricultural loan eligibility.
--   TIN     - Tax Identification Number. Required for crediting interest and
--             for year-end reporting.
--   NCFRS   - National Cooperative Financial Reporting System number. Required
--             for CDA registration and reporting.
--   PCA ID  - Philippine Coconut Authority ID. Relevant to the cooperative's
--             principal product line.
--
-- Losing these at approval means the cooperative cannot later assess loan
-- eligibility or produce compliant statutory reports.
--
-- This migration adds the columns to public.members, ensures the same columns
-- exist on public.member_applications, and rewrites the approval trigger to
-- carry every field across.
--
-- IDEMPOTENT.
-- ============================================


-- ============================================
-- 1. GUARD: table must exist
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.members') IS NULL THEN
    RAISE EXCEPTION 'public.members does not exist. Apply the base schema first.';
  END IF;
  IF to_regclass('public.member_applications') IS NULL THEN
    RAISE EXCEPTION
      'public.member_applications does not exist. Apply database/member_applications.sql first.';
  END IF;
END $$;
-- ============================================
-- 2. COLUMNS ON members
-- ============================================
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS rsbsa   TEXT,
  ADD COLUMN IF NOT EXISTS tin     TEXT,
  ADD COLUMN IF NOT EXISTS ncfrs   TEXT,
  ADD COLUMN IF NOT EXISTS pca_id  TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS barangay   TEXT,
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS province     TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS family_members JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.members.rsbsa   IS 'Rural-based Small-scale Agricultural number, from the membership application';
COMMENT ON COLUMN public.members.tin     IS 'Tax Identification Number, from the membership application';
COMMENT ON COLUMN public.members.ncfrs   IS 'National Cooperative Financial Reporting System number';
COMMENT ON COLUMN public.members.pca_id  IS 'Philippine Coconut Authority ID';
COMMENT ON COLUMN public.members.occupation IS 'Occupation declared at signup';
COMMENT ON COLUMN public.members.barangay   IS 'Barangay, from the membership application';
COMMENT ON COLUMN public.members.municipality IS 'Municipality / city, from the membership application';
COMMENT ON COLUMN public.members.province     IS 'Province, from the membership application';
COMMENT ON COLUMN public.members.emergency_contact_name  IS 'Emergency contact person';
COMMENT ON COLUMN public.members.emergency_contact_phone IS 'Emergency contact number';
COMMENT ON COLUMN public.members.family_members IS 'Family members declared at signup, as a JSONB array';
-- ============================================
-- 3. ENSURE THE SAME COLUMNS EXIST ON member_applications
-- ============================================
-- 20260926000001 should have created these, but making the dependency
-- explicit means the trigger below cannot fail on a partially-applied schema.
ALTER TABLE public.member_applications
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS family_members JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS date_joined DATE,
  ADD COLUMN IF NOT EXISTS rsbsa  TEXT,
  ADD COLUMN IF NOT EXISTS tin    TEXT,
  ADD COLUMN IF NOT EXISTS ncfrs  TEXT,
  ADD COLUMN IF NOT EXISTS pca_id TEXT,
  -- Present in database/member_applications.sql; re-asserted here because the
  -- trigger below reads them and must not fail on a partially built schema.
  ADD COLUMN IF NOT EXISTS occupation   TEXT,
  ADD COLUMN IF NOT EXISTS barangay     TEXT,
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS province     TEXT;
-- ============================================
-- 4. REWRITE THE APPROVAL TRIGGER
-- ============================================
-- Every field captured on the application is now carried into public.members.
--
-- Note the member number is still derived from COUNT(*), which is not safe
-- under concurrent approvals. This is left in place here because changing the
-- numbering scheme is a separate concern; it is called out so it is not lost.
CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_count   INTEGER;
  new_member_number TEXT;
  new_member_id  UUID;
  new_full_name  TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN

    new_full_name := concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name);

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
      NEW.user_id,
      NEW.email,
      NEW.email,
      new_full_name,
      'member',
      true,
      new_member_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id  = EXCLUDED.member_id,
          role       = 'member',
          is_active  = true,
          full_name  = EXCLUDED.full_name;

  END IF;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.create_member_from_application() IS
  'On approval, copies every field from member_applications into members and links the auth user via a staff row with role=member.';
-- ============================================
-- 5. BACKFILL FROM EXISTING APPLICATIONS
-- ============================================
-- Applications approved before this migration already have a members row.
-- Fill in the fields that were dropped at the time, matching on email.
DO $$
DECLARE
  filled INTEGER := 0;
BEGIN
  UPDATE public.members m
  SET rsbsa                  = a.rsbsa,
      tin                    = a.tin,
      ncfrs                  = a.ncfrs,
      pca_id                 = a.pca_id,
      occupation             = a.occupation,
      barangay               = a.barangay,
      municipality           = a.municipality,
      province               = a.province,
      emergency_contact_name  = a.emergency_contact_name,
      emergency_contact_phone = a.emergency_contact_phone,
      family_members          = COALESCE(a.family_members, '[]'::jsonb)
  FROM public.member_applications a
  WHERE a.email = m.email
    AND a.status = 'approved'
    AND m.rsbsa IS NULL
    AND (a.rsbsa IS NOT NULL OR a.tin IS NOT NULL OR a.ncfrs IS NOT NULL
         OR a.pca_id IS NOT NULL OR a.occupation IS NOT NULL
         OR a.barangay IS NOT NULL OR a.municipality IS NOT NULL
         OR a.province IS NOT NULL);

  GET DIAGNOSTICS filled = ROW_COUNT;
  RAISE NOTICE 'Backfilled % existing member record(s) from their application.', filled;
END $$;
-- ============================================
-- 6. VERIFICATION
-- ============================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(column_name, ', ')
    INTO missing
  FROM (
    SELECT unnest(ARRAY[
      'rsbsa','tin','ncfrs','pca_id','occupation',
      'barangay','municipality','province',
      'emergency_contact_name','emergency_contact_phone','family_members'
    ]) AS column_name
  ) want
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = 'members'
      AND c.column_name  = want.column_name
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Columns missing from public.members: %', missing;
  END IF;

  RAISE NOTICE '✓ Migration 20260927000004 completed.';
  RAISE NOTICE '✓ 11 application fields now persist into public.members.';
  RAISE NOTICE '✓ Approval trigger carries every captured field.';
  RAISE NOTICE '✓ Existing approved members backfilled where possible.';
END $$;

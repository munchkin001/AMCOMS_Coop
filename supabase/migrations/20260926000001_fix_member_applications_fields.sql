-- ============================================
-- AMCOMS: Fix Member Applications Schema
-- Migration: 20260926000001
-- Description: Add missing fields required by Spec §5:
--   gender, emergency contact, family members,
--   date joined, RSBSA, TIN, NCFRS, PCA ID
-- ============================================

-- 1. ADD MISSING COLUMNS
ALTER TABLE public.member_applications
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS family_members JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS date_joined DATE,
  ADD COLUMN IF NOT EXISTS rsbsa TEXT,
  ADD COLUMN IF NOT EXISTS tin TEXT,
  ADD COLUMN IF NOT EXISTS ncfrs TEXT,
  ADD COLUMN IF NOT EXISTS pca_id TEXT;

-- 2. UPDATE THE APPROVAL TRIGGER TO INCLUDE NEW FIELDS
CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER AS $$
DECLARE
  member_count INTEGER;
  new_member_number TEXT;
  new_member_id UUID;
BEGIN
  -- Only create member if status changed to 'approved'
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    -- Generate member number
    SELECT COUNT(*) INTO member_count FROM public.members;
    new_member_number := 'M-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD((member_count + 1)::TEXT, 5, '0');

    -- Insert into members table with all fields
    INSERT INTO public.members (
      member_number,
      first_name,
      middle_name,
      last_name,
      email,
      phone,
      address,
      date_of_birth,
      gender,
      membership_type,
      membership_status,
      date_joined,
      created_at
    ) VALUES (
      new_member_number,
      NEW.first_name,
      NEW.middle_name,
      NEW.last_name,
      NEW.email,
      NEW.phone,
      NEW.address,
      NEW.date_of_birth,
      NEW.gender,
      'regular',
      'active',
      COALESCE(NEW.date_joined, CURRENT_DATE),
      NOW()
    )
    RETURNING id INTO new_member_id;

    -- Update staff table to link user_id with member
    INSERT INTO public.staff (
      user_id,
      username,
      email,
      full_name,
      role,
      is_active,
      member_id
    ) VALUES (
      NEW.user_id,
      NEW.email,
      NEW.email,
      CONCAT(NEW.first_name, ' ', COALESCE(NEW.middle_name || ' ', ''), NEW.last_name),
      'member',
      true,
      new_member_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id = new_member_id,
          role = 'member',
          is_active = true,
          full_name = CONCAT(NEW.first_name, ' ', COALESCE(NEW.middle_name || ' ', ''), NEW.last_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. ADD RLS POLICY FOR MEMBER APPLICATIONS INSERT
-- (The existing policies should still work, but let's ensure INSERT is allowed for authenticated users)
DROP POLICY IF EXISTS "Authenticated users can create application" ON public.member_applications;
CREATE POLICY "Authenticated users can create application"
  ON public.member_applications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. ADD COMMENTS
COMMENT ON COLUMN public.member_applications.gender IS 'Member gender';
COMMENT ON COLUMN public.member_applications.emergency_contact_name IS 'Emergency contact person name';
COMMENT ON COLUMN public.member_applications.emergency_contact_phone IS 'Emergency contact phone number';
COMMENT ON COLUMN public.member_applications.family_members IS 'JSONB array of family members';
COMMENT ON COLUMN public.member_applications.date_joined IS 'Date when member joined the cooperative';
COMMENT ON COLUMN public.member_applications.rsbsa IS 'RSBSA (Rural-based Small-scale Agricultural) number';
COMMENT ON COLUMN public.member_applications.tin IS 'Tax Identification Number';
COMMENT ON COLUMN public.member_applications.ncfrs IS 'NCFRS (National Cooperative Financial Reporting System) number';
COMMENT ON COLUMN public.member_applications.pca_id IS 'PCA (Philippine Coconut Authority) ID';

-- 5. SUCCESS MESSAGE
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 20260926000001 completed successfully!';
  RAISE NOTICE '✓ Added columns: gender, emergency_contact_name, emergency_contact_phone,';
  RAISE NOTICE '  family_members, date_joined, rsbsa, tin, ncfrs, pca_id';
  RAISE NOTICE '✓ Updated create_member_from_application trigger';
END $$;

-- ============================================
-- AMCOMS: Create Test Users
-- Migration: 20260926000002
-- Description: Creates staff and member test accounts.
--   Passwords are handled by Supabase Auth (never stored manually).
--   This migration only confirms emails and creates profile records.
-- ============================================

-- 1. CONFIRM EMAILS FOR TEST USERS
UPDATE auth.users
SET email_confirmed_at = NOW(),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"email_confirmed": true}'::jsonb
WHERE email IN (
  'chairman@amcoms.com',
  'manager@amcoms.com',
  'treasurer@amcoms.com',
  'bookkeeper@amcoms.com',
  'inventory@amcoms.com',
  'member@amcoms.com'
)
AND email_confirmed_at IS NULL;

-- 2. ADD UNIQUE CONSTRAINT ON user_id (one staff record per auth user)
ALTER TABLE public.staff ADD CONSTRAINT staff_user_id_unique UNIQUE (user_id);

-- 3. CREATE STAFF PROFILES
-- Chairman
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT id, 'chairman', 'chairman@amcoms.com', 'John Chairman', 'chairman', true
FROM auth.users WHERE email = 'chairman@amcoms.com'
ON CONFLICT (user_id) DO NOTHING;

-- Manager
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT id, 'manager', 'manager@amcoms.com', 'Jane Manager', 'manager', true
FROM auth.users WHERE email = 'manager@amcoms.com'
ON CONFLICT (user_id) DO NOTHING;

-- Treasurer
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT id, 'treasurer', 'treasurer@amcoms.com', 'Bob Treasurer', 'treasurer', true
FROM auth.users WHERE email = 'treasurer@amcoms.com'
ON CONFLICT (user_id) DO NOTHING;

-- Bookkeeper
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT id, 'bookkeeper', 'bookkeeper@amcoms.com', 'Alice Bookkeeper', 'bookkeeper', true
FROM auth.users WHERE email = 'bookkeeper@amcoms.com'
ON CONFLICT (user_id) DO NOTHING;

-- Inventory Staff
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT id, 'inventory', 'inventory@amcoms.com', 'Tom Inventory', 'inventory', true
FROM auth.users WHERE email = 'inventory@amcoms.com'
ON CONFLICT (user_id) DO NOTHING;

-- Member (also a staff record with role='member' and member_id link)
-- First create the member record
INSERT INTO public.members (
  member_number, first_name, last_name, email, phone, address,
  date_of_birth, gender, membership_type, membership_status, date_joined
)
SELECT
  'M-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-00001',
  'Maria', 'Santos', 'member@amcoms.com', '09171234567', 'Agay-ayan, Gingoog City',
  '1990-05-15', 'female', 'regular', 'active', CURRENT_DATE
FROM auth.users WHERE email = 'member@amcoms.com'
ON CONFLICT (email) DO NOTHING;

-- Then create the staff record for the member
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active, member_id)
SELECT
  u.id, 'member', 'member@amcoms.com', 'Maria Santos', 'member', true, m.id
FROM auth.users u
JOIN public.members m ON m.email = u.email
WHERE u.email = 'member@amcoms.com'
ON CONFLICT (user_id) DO UPDATE
  SET member_id = EXCLUDED.member_id,
      role = 'member',
      is_active = true;

-- 3. VERIFY
DO $$
DECLARE
  staff_count INTEGER;
  member_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO staff_count FROM public.staff;
  SELECT COUNT(*) INTO member_count FROM public.members;
  RAISE NOTICE '✓ Test users created successfully!';
  RAISE NOTICE '✓ Staff records: %', staff_count;
  RAISE NOTICE '✓ Member records: %', member_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test Credentials:';
  RAISE NOTICE '  Chairman:    chairman@amcoms.com / Chairman@123';
  RAISE NOTICE '  Manager:     manager@amcoms.com / Manager@123';
  RAISE NOTICE '  Treasurer:   treasurer@amcoms.com / Treasurer@123';
  RAISE NOTICE '  Bookkeeper:  bookkeeper@amcoms.com / Bookkeeper@123';
  RAISE NOTICE '  Inventory:   inventory@amcoms.com / Inventory@123';
  RAISE NOTICE '  Member:      member@amcoms.com / Member@123';
END $$;

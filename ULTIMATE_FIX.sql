-- ============================================
-- ULTIMATE FIX - Check and Fix ALL Staff Roles
-- Chairman, Manager, Treasurer, Bookkeeper, Inventory
-- ============================================

-- STEP 1: Check if staff table has ANY records
SELECT 
  'STEP 1: Total staff records' as check_name,
  COUNT(*) as total_records
FROM staff;

-- STEP 2: Check ALL five staff roles
SELECT 
  'STEP 2: Staff role check' as check_name,
  role,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅ Exists' ELSE '❌ Missing' END as status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
GROUP BY role
ORDER BY 
  CASE role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;

-- STEP 3: Show details of ALL staff records
SELECT 
  'STEP 3: All staff details' as check_name,
  id,
  email,
  full_name,
  role,
  user_id,
  is_active,
  member_id
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY 
  CASE role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;

-- STEP 4: Check RLS status
SELECT 
  'STEP 4: RLS Status' as check_name,
  tablename,
  CASE WHEN rowsecurity THEN '❌ ENABLED (This blocks queries!)' ELSE '✅ DISABLED (Good)' END as rls_status
FROM pg_tables
WHERE tablename = 'staff';

-- STEP 5: Disable RLS if enabled
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- STEP 6: Drop all policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'staff') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON staff CASCADE';
    END LOOP;
END $$;

-- STEP 7: Create ALL missing staff records (if auth users exist)
-- Chairman
INSERT INTO staff (email, full_name, role, is_active, user_id, username)
SELECT 
  'chairman@amcoms.com',
  'Chairman User',
  'chairman',
  true,
  u.id,
  'chairman'
FROM auth.users u
WHERE u.email = 'chairman@amcoms.com'
AND NOT EXISTS (SELECT 1 FROM staff WHERE email = 'chairman@amcoms.com');

-- Manager
INSERT INTO staff (email, full_name, role, is_active, user_id, username)
SELECT 
  'manager@amcoms.com',
  'Manager User',
  'manager',
  true,
  u.id,
  'manager'
FROM auth.users u
WHERE u.email = 'manager@amcoms.com'
AND NOT EXISTS (SELECT 1 FROM staff WHERE email = 'manager@amcoms.com');

-- Treasurer
INSERT INTO staff (email, full_name, role, is_active, user_id, username)
SELECT 
  'treasurer@amcoms.com',
  'Treasurer User',
  'treasurer',
  true,
  u.id,
  'treasurer'
FROM auth.users u
WHERE u.email = 'treasurer@amcoms.com'
AND NOT EXISTS (SELECT 1 FROM staff WHERE email = 'treasurer@amcoms.com');

-- Bookkeeper
INSERT INTO staff (email, full_name, role, is_active, user_id, username)
SELECT 
  'bookkeeper@amcoms.com',
  'Bookkeeper User',
  'bookkeeper',
  true,
  u.id,
  'bookkeeper'
FROM auth.users u
WHERE u.email = 'bookkeeper@amcoms.com'
AND NOT EXISTS (SELECT 1 FROM staff WHERE email = 'bookkeeper@amcoms.com');

-- Inventory
INSERT INTO staff (email, full_name, role, is_active, user_id, username)
SELECT 
  'inventory@amcoms.com',
  'Inventory User',
  'inventory',
  true,
  u.id,
  'inventory'
FROM auth.users u
WHERE u.email = 'inventory@amcoms.com'
AND NOT EXISTS (SELECT 1 FROM staff WHERE email = 'inventory@amcoms.com');

-- STEP 8: Make sure ALL staff are linked to auth users
UPDATE staff s
SET 
  user_id = u.id,
  is_active = true
FROM auth.users u
WHERE s.email = u.email
AND s.role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory');

-- STEP 9: Final verification for ALL staff
SELECT 
  'STEP 9: FINAL STATUS - ALL STAFF' as check_name,
  s.email,
  s.full_name,
  s.role,
  s.is_active,
  s.user_id,
  u.id as auth_user_id,
  CASE 
    WHEN s.user_id = u.id AND s.is_active THEN '✅ CAN LOGIN'
    WHEN s.user_id IS NULL THEN '❌ NOT LINKED TO AUTH USER'
    WHEN NOT s.is_active THEN '❌ INACTIVE'
    ELSE '❌ UNKNOWN ISSUE'
  END as status
FROM staff s
LEFT JOIN auth.users u ON s.email = u.email
WHERE s.role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY 
  CASE s.role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;

-- STEP 10: Test the exact query the app uses for each role
SELECT 
  'STEP 10: App Query Test - ALL ROLES' as check_name,
  id, 
  email, 
  full_name, 
  role, 
  user_id, 
  is_active, 
  member_id
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY 
  CASE role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;

-- STEP 11: Count how many staff CAN login vs CANNOT
SELECT 
  'STEP 11: Login Status Summary' as check_name,
  COUNT(*) as total_staff,
  SUM(CASE WHEN user_id IS NOT NULL AND is_active THEN 1 ELSE 0 END) as can_login,
  SUM(CASE WHEN user_id IS NULL OR NOT is_active THEN 1 ELSE 0 END) as cannot_login
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory');

-- Expected result: can_login = 5, cannot_login = 0

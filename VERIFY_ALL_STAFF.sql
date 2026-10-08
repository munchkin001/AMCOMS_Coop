-- ============================================
-- VERIFY ALL STAFF ROLES - Quick Status Check
-- ============================================
-- Run this to instantly see which staff can login

-- Check 1: How many staff records exist per role
SELECT 
  '📊 STAFF COUNT BY ROLE' as check_title,
  role,
  COUNT(*) as count
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

-- Expected: 1 record for each role = 5 total rows

-- Check 2: Show login status for each staff member
SELECT 
  '🔐 LOGIN STATUS' as check_title,
  CASE role
    WHEN 'chairman' THEN '1. 👔 Chairman'
    WHEN 'manager' THEN '2. 🎯 Manager'
    WHEN 'treasurer' THEN '3. 💰 Treasurer'
    WHEN 'bookkeeper' THEN '4. 📊 Bookkeeper'
    WHEN 'inventory' THEN '5. 📦 Inventory'
  END as role_display,
  email,
  full_name,
  is_active,
  CASE 
    WHEN user_id IS NOT NULL AND is_active THEN '✅ CAN LOGIN'
    WHEN user_id IS NULL THEN '❌ NOT LINKED TO AUTH'
    WHEN NOT is_active THEN '❌ INACTIVE'
    ELSE '❌ UNKNOWN ISSUE'
  END as login_status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY role_display;

-- Expected: All 5 rows show ✅ CAN LOGIN

-- Check 3: Verify auth users exist for all staff emails
SELECT 
  '👤 AUTH USERS CHECK' as check_title,
  s.role,
  s.email,
  s.user_id as staff_user_id,
  u.id as auth_user_id,
  CASE 
    WHEN u.id IS NOT NULL THEN '✅ Auth user exists'
    ELSE '❌ No auth user found'
  END as auth_status,
  CASE 
    WHEN s.user_id = u.id THEN '✅ Correctly linked'
    WHEN s.user_id IS NULL THEN '❌ Not linked'
    WHEN s.user_id != u.id THEN '⚠️ Wrong user_id'
  END as link_status
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

-- Expected: All rows show ✅ Auth user exists and ✅ Correctly linked

-- Check 4: Summary - How many can vs. cannot login
SELECT 
  '📈 SUMMARY' as check_title,
  COUNT(*) as total_staff_roles,
  SUM(CASE WHEN user_id IS NOT NULL AND is_active THEN 1 ELSE 0 END) as ready_to_login,
  SUM(CASE WHEN user_id IS NULL OR NOT is_active THEN 1 ELSE 0 END) as cannot_login,
  CASE 
    WHEN SUM(CASE WHEN user_id IS NOT NULL AND is_active THEN 1 ELSE 0 END) = 5 
    THEN '✅ PERFECT - ALL 5 STAFF CAN LOGIN'
    ELSE '❌ ISSUES DETECTED - See above checks'
  END as overall_status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory');

-- Expected: ready_to_login = 5, cannot_login = 0

-- Check 5: Check RLS status (should be DISABLED for now)
SELECT 
  '🔒 RLS STATUS' as check_title,
  tablename,
  CASE 
    WHEN rowsecurity THEN '❌ ENABLED - This may block queries'
    ELSE '✅ DISABLED - Good for testing'
  END as rls_status,
  CASE 
    WHEN rowsecurity THEN 'Run: ALTER TABLE staff DISABLE ROW LEVEL SECURITY;'
    ELSE 'No action needed'
  END as action_needed
FROM pg_tables
WHERE tablename = 'staff';

-- Check 6: List missing roles (if any)
WITH expected_roles AS (
  SELECT unnest(ARRAY['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory']) as role
),
existing_roles AS (
  SELECT DISTINCT role
  FROM staff
  WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
)
SELECT 
  '⚠️ MISSING ROLES' as check_title,
  er.role as missing_role,
  'This role needs to be created' as action_needed
FROM expected_roles er
LEFT JOIN existing_roles ex ON er.role = ex.role
WHERE ex.role IS NULL;

-- Expected: No rows (all roles exist)

-- Check 7: Show which auth users exist but don't have staff records
SELECT 
  '🔍 ORPHANED AUTH USERS' as check_title,
  u.email,
  'Auth user exists but no staff record' as issue,
  'Create staff record for this user' as action_needed
FROM auth.users u
WHERE u.email LIKE '%@amcoms.com'
  AND u.email IN ('chairman@amcoms.com', 'manager@amcoms.com', 'treasurer@amcoms.com', 
                  'bookkeeper@amcoms.com', 'inventory@amcoms.com')
  AND NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.email = u.email
  );

-- Expected: No rows (all auth users have staff records)

-- ============================================
-- INTERPRETATION GUIDE
-- ============================================

/*
✅ GREEN CHECKMARKS = Good, no issues
❌ RED X = Problem needs fixing
⚠️ WARNING = Potential issue

WHAT TO DO IF ISSUES FOUND:

1. If "cannot_login" > 0:
   - Run ULTIMATE_FIX.sql to create and link records

2. If "RLS ENABLED":
   - Run: ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

3. If "MISSING ROLES" shows results:
   - Create missing auth users in Supabase Dashboard
   - Then run ULTIMATE_FIX.sql

4. If "ORPHANED AUTH USERS" shows results:
   - Run ULTIMATE_FIX.sql to create staff records

5. If "NOT LINKED TO AUTH":
   - Run: UPDATE staff s SET user_id = u.id 
          FROM auth.users u WHERE s.email = u.email;

AFTER FIXES:
Run this script again to verify all ✅ green checkmarks
*/

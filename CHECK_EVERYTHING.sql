-- ============================================
-- CHECK EVERYTHING - Complete Diagnosis
-- ============================================

-- 1. Check if RLS is disabled
SELECT 
  '1. RLS STATUS' as check_name,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'staff';

-- 2. Check auth users
SELECT 
  '2. AUTH USERS' as check_name,
  id,
  email,
  confirmed_at IS NOT NULL as is_confirmed,
  created_at
FROM auth.users
WHERE email = 'manager@amcoms.com';

-- 3. Check staff records
SELECT 
  '3. STAFF RECORD' as check_name,
  id,
  email,
  full_name,
  role,
  position,
  user_id,
  is_active,
  created_at
FROM staff
WHERE email = 'manager@amcoms.com';

-- 4. Check if they're linked
SELECT 
  '4. LINKING STATUS' as check_name,
  s.email,
  s.user_id as staff_user_id,
  u.id as auth_user_id,
  s.user_id = u.id as correctly_linked,
  s.is_active
FROM staff s
JOIN auth.users u ON s.email = u.email
WHERE s.email = 'manager@amcoms.com';

-- 5. Try to fetch as the app would (simulating authenticated user)
SELECT 
  '5. APP QUERY SIMULATION' as check_name,
  *
FROM staff
WHERE email = 'manager@amcoms.com'
LIMIT 1;

-- 6. Check RLS policies
SELECT 
  '6. RLS POLICIES' as check_name,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'staff';

-- 7. Check if staff table is accessible
SELECT 
  '7. SIMPLE READ TEST' as check_name,
  COUNT(*) as total_staff_records
FROM staff;

-- ============================================
-- INTERPRETATION
-- ============================================
-- If RLS is enabled (TRUE), you need to disable it
-- If correctly_linked is FALSE, run the linking SQL
-- If is_active is FALSE, the account is disabled
-- If you see "permission denied" anywhere, it's an RLS issue
-- ============================================

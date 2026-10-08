-- ============================================
-- DIAGNOSE LOGIN ISSUE
-- ============================================
-- Run this in Supabase SQL Editor to see what's wrong
-- ============================================

-- Step 1: Check if auth users exist
SELECT 
  '1. AUTH USERS STATUS' as check_name,
  id,
  email,
  created_at,
  last_sign_in_at,
  confirmed_at,
  CASE 
    WHEN confirmed_at IS NULL THEN 'NOT CONFIRMED'
    ELSE 'CONFIRMED'
  END as status
FROM auth.users
ORDER BY email;

-- Step 2: Check staff records
SELECT 
  '2. STAFF RECORDS STATUS' as check_name,
  id,
  email,
  full_name,
  role,
  user_id,
  is_active,
  CASE 
    WHEN user_id IS NULL THEN 'NOT LINKED'
    WHEN NOT is_active THEN 'INACTIVE'
    ELSE 'READY'
  END as status
FROM public.staff
ORDER BY email;

-- Step 3: Check linking between auth and staff
SELECT 
  '3. LINKING STATUS' as check_name,
  s.email,
  s.full_name,
  s.role,
  s.is_active as staff_active,
  s.user_id as staff_user_id,
  u.id as auth_user_id,
  u.confirmed_at as auth_confirmed,
  CASE 
    WHEN u.id IS NULL THEN '❌ NO AUTH USER - Cannot login'
    WHEN u.confirmed_at IS NULL THEN '⚠️ AUTH USER NOT CONFIRMED - Cannot login'
    WHEN NOT s.is_active THEN '⚠️ STAFF INACTIVE - Cannot login'
    WHEN s.user_id IS NULL THEN '⚠️ NOT LINKED - Can login but profile will fail'
    WHEN s.user_id != u.id THEN '❌ WRONG LINK - Profile will fail'
    ELSE '✅ PERFECT - Can login successfully'
  END as diagnosis,
  CASE 
    WHEN u.id IS NULL THEN 'Create auth user in Supabase Dashboard → Authentication → Users'
    WHEN u.confirmed_at IS NULL THEN 'Confirm user email or set confirmed_at in auth.users'
    WHEN NOT s.is_active THEN 'UPDATE staff SET is_active = true WHERE email = ''' || s.email || ''';'
    WHEN s.user_id IS NULL THEN 'Run URGENT_FIX_LOGIN.sql to link'
    WHEN s.user_id != u.id THEN 'UPDATE staff SET user_id = ''' || u.id || ''' WHERE email = ''' || s.email || ''';'
    ELSE 'No action needed'
  END as solution
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
ORDER BY s.email;

-- Step 4: Specific check for manager@amcoms.com
SELECT 
  '4. SPECIFIC CHECK: manager@amcoms.com' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@amcoms.com') 
    THEN 'Auth user EXISTS'
    ELSE 'Auth user DOES NOT EXIST - This is why login fails!'
  END as auth_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.staff WHERE email = 'manager@amcoms.com') 
    THEN 'Staff record EXISTS'
    ELSE 'Staff record DOES NOT EXIST'
  END as staff_status;

-- Step 5: Show what needs to be done
SELECT 
  '5. ACTION ITEMS' as check_name,
  COUNT(*) FILTER (WHERE u.id IS NULL) as "Need to create auth users",
  COUNT(*) FILTER (WHERE u.confirmed_at IS NULL) as "Need to confirm email",
  COUNT(*) FILTER (WHERE s.user_id IS NULL AND u.id IS NOT NULL) as "Need to link (run URGENT_FIX_LOGIN.sql)",
  COUNT(*) FILTER (WHERE NOT s.is_active) as "Need to activate staff",
  COUNT(*) FILTER (WHERE s.user_id IS NOT NULL AND u.id IS NOT NULL AND s.is_active) as "Ready to login"
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email;

-- ============================================
-- INTERPRETATION GUIDE
-- ============================================
-- 
-- If "Auth user DOES NOT EXIST":
--   → You need to create the user in Supabase Dashboard
--   → Go to: Authentication → Users → Add User
--   → Email: manager@amcoms.com
--   → Password: (set a password)
--   → ✓ Auto Confirm User
--
-- If "Auth user EXISTS" but "NOT CONFIRMED":
--   → User exists but email not confirmed
--   → Solution: In auth.users, update confirmed_at
--
-- If "NOT LINKED":
--   → Auth user exists, but staff.user_id is NULL
--   → Solution: Run URGENT_FIX_LOGIN.sql
--
-- If "STAFF INACTIVE":
--   → Account exists but disabled
--   → Solution: UPDATE staff SET is_active = true
-- ============================================

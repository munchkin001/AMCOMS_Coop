-- ============================================
-- FIX STAFF-USER LINKING ISSUE
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check current status
SELECT 
  '🔍 DIAGNOSIS' as step,
  COUNT(*) as total_staff,
  COUNT(user_id) as staff_with_user_id,
  COUNT(*) - COUNT(user_id) as staff_without_user_id,
  COUNT(DISTINCT u.id) as matching_auth_users
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email;

-- Step 2: Show unlinked staff records
SELECT 
  '❌ UNLINKED STAFF' as step,
  s.id as staff_id,
  s.email,
  s.full_name,
  s.role,
  s.user_id as current_user_id,
  u.id as auth_user_id,
  CASE 
    WHEN u.id IS NOT NULL THEN '✅ Can auto-link'
    ELSE '⚠️ Need to create auth user first'
  END as status
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
WHERE s.user_id IS NULL;

-- Step 3: Auto-link staff to auth users by matching email
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND s.user_id IS NULL;

-- Step 4: Verify the fix
SELECT 
  '✅ VERIFICATION' as step,
  s.email,
  s.full_name,
  s.role,
  s.is_active,
  s.user_id,
  u.id as auth_user_id,
  u.email as auth_email,
  CASE 
    WHEN s.user_id = u.id THEN '✅ Linked Correctly'
    WHEN s.user_id IS NULL AND u.id IS NOT NULL THEN '❌ Still Unlinked (check RLS)'
    WHEN s.user_id IS NULL AND u.id IS NULL THEN '⚠️ No Auth User Exists'
    ELSE '⚠️ Mismatch'
  END as link_status
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
ORDER BY s.email;

-- Step 5: Show remaining issues
SELECT 
  '⚠️ REMAINING ISSUES' as step,
  s.email,
  s.full_name,
  s.role,
  CASE 
    WHEN u.id IS NULL THEN 'Need to create auth user for this email'
    WHEN s.user_id IS NULL THEN 'Failed to link (check RLS policies)'
    ELSE 'Unknown issue'
  END as action_needed
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
WHERE s.user_id IS NULL;

-- ============================================
-- MANUAL AUTH USER CREATION (if needed)
-- ============================================

-- If the query above shows staff without auth users,
-- you need to create auth users manually via:
-- Supabase Dashboard → Authentication → Add User
-- 
-- For each email, create:
-- - Email: (staff email)
-- - Password: (temporary password - user should reset)
-- - Auto-confirm: YES
--
-- Then re-run this script to auto-link them.

-- ============================================
-- OPTIONAL: Create trigger for future staff
-- ============================================

-- This trigger will auto-link new staff records to auth users
CREATE OR REPLACE FUNCTION public.auto_link_staff_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- If user_id is not provided, try to find matching auth user by email
  IF NEW.user_id IS NULL THEN
    SELECT id INTO NEW.user_id
    FROM auth.users
    WHERE email = NEW.email
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS auto_link_staff_trigger ON public.staff;

CREATE TRIGGER auto_link_staff_trigger
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  WHEN (NEW.user_id IS NULL)
  EXECUTE FUNCTION public.auto_link_staff_to_auth();

-- ============================================
-- FINAL STATUS CHECK
-- ============================================

SELECT 
  '📊 FINAL STATUS' as result,
  COUNT(*) as total_staff,
  COUNT(user_id) as linked_staff,
  COUNT(*) - COUNT(user_id) as unlinked_staff,
  ROUND(100.0 * COUNT(user_id) / COUNT(*), 1) as percent_linked
FROM public.staff;

-- Expected result: 
-- total_staff = linked_staff
-- unlinked_staff = 0
-- percent_linked = 100.0

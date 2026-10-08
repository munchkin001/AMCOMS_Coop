-- ============================================
-- URGENT FIX: Link Staff Records to Auth Users
-- ============================================
-- Copy and paste this ENTIRE script into Supabase SQL Editor
-- Then click "Run" button
-- ============================================

-- Step 1: Check what needs fixing
SELECT 
  'Before Fix - Unlinked Staff' as status,
  COUNT(*) as count
FROM public.staff
WHERE user_id IS NULL;

-- Step 2: Link all staff records to their auth users
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND s.user_id IS NULL;

-- Step 3: Verify the fix worked
SELECT 
  'After Fix - Still Unlinked' as status,
  COUNT(*) as count
FROM public.staff
WHERE user_id IS NULL;

-- Step 4: Show all staff with their linking status
SELECT 
  s.email,
  s.role,
  CASE 
    WHEN s.user_id IS NOT NULL THEN 'LINKED - Can Login'
    ELSE 'NOT LINKED - Cannot Login'
  END as login_status,
  s.is_active as account_active
FROM public.staff s
ORDER BY s.email;

-- ============================================
-- RESULT INTERPRETATION:
-- ============================================
-- Look at "After Fix - Still Unlinked" count
-- - If count = 0: SUCCESS! All users can now log in
-- - If count > 0: Some staff emails don't have auth users
--                 You need to create auth users in Supabase Dashboard
-- ============================================

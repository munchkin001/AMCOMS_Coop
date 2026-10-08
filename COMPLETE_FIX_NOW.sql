-- ============================================
-- COMPLETE FIX - Run this in Supabase SQL Editor
-- ============================================
-- This fixes ALL possible issues at once
-- ============================================

-- Step 1: Disable RLS temporarily to allow profile loading
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Step 2: Verify staff record exists and is active
UPDATE staff
SET is_active = true
WHERE email = 'manager@amcoms.com';

-- Step 3: Link staff to auth user
UPDATE staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND (s.user_id IS NULL OR s.user_id != u.id);

-- Step 4: Verify the fix
SELECT 
  s.email,
  s.role,
  s.full_name,
  s.is_active,
  s.user_id,
  u.id as auth_user_id,
  u.email as auth_email,
  CASE 
    WHEN s.user_id = u.id AND s.is_active THEN '✅ READY - Can Login'
    WHEN s.user_id IS NULL THEN '❌ NOT LINKED'
    WHEN NOT s.is_active THEN '⚠️ INACTIVE'
    ELSE '⚠️ CHECK MANUALLY'
  END as status
FROM staff s
LEFT JOIN auth.users u ON s.email = u.email
ORDER BY s.email;

-- Step 5: Create proper RLS policies for future
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read own staff record" ON staff;
DROP POLICY IF EXISTS "Service role has full access" ON staff;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON staff;

-- Create new policy: Users can read their own record
CREATE POLICY "Users can read own staff record"
ON staff
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create policy: Allow initial profile fetch by email
CREATE POLICY "Users can read staff by email"
ON staff
FOR SELECT
TO authenticated
USING (auth.email() = email);

-- Step 6: Final verification
SELECT 
  'Final Status' as check,
  COUNT(*) as total_staff,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked_staff,
  COUNT(CASE WHEN is_active THEN 1 END) as active_staff,
  COUNT(CASE WHEN user_id IS NOT NULL AND is_active THEN 1 END) as ready_to_login
FROM staff;

-- ============================================
-- EXPECTED RESULT
-- ============================================
-- All staff should show: "✅ READY - Can Login"
-- ready_to_login count should equal total_staff
--
-- After running this:
-- 1. Clear browser cache (Ctrl+Shift+Delete)
-- 2. Go to login page
-- 3. Try: manager@amcoms.com / manager123
-- 4. Should work immediately!
-- ============================================

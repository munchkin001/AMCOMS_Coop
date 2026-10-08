-- ============================================
-- FIX ROW LEVEL SECURITY POLICIES
-- ============================================
-- This might be blocking staff profile access
-- ============================================

-- Step 1: Check current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'staff';

-- Step 2: Check existing policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'staff';

-- Step 3: TEMPORARILY disable RLS to test (DO THIS FIRST)
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Step 4: If that works, create proper policies
-- Enable RLS again
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own staff record
CREATE POLICY "Users can read own staff record"
ON staff
FOR SELECT
USING (auth.uid() = user_id);

-- Allow service role full access (for admin operations)
CREATE POLICY "Service role has full access"
ON staff
FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- TESTING
-- ============================================

-- After running the fix, test this query:
SELECT 
  email,
  role,
  user_id,
  is_active
FROM staff
WHERE email = 'manager@amcoms.com';

-- If you see the data, RLS is fixed!

-- Completely recreate member_applications table with proper RLS from scratch

-- First, drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can create application" ON member_applications;
DROP POLICY IF EXISTS "Members can create application" ON member_applications;
DROP POLICY IF EXISTS "Members can view own application" ON member_applications;
DROP POLICY IF EXISTS "Staff can view all applications" ON member_applications;
DROP POLICY IF EXISTS "Managers can update applications" ON member_applications;
DROP POLICY IF EXISTS "Allow signup insert" ON member_applications;

-- Temporarily disable RLS to allow full access
ALTER TABLE member_applications DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE member_applications ENABLE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies (these are OR'd together, making them less restrictive)

-- 1. Allow INSERT for ANY authenticated user (most permissive for signup)
CREATE POLICY "signup_insert" ON member_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- Allow any authenticated user to insert

-- 2. Allow SELECT for application owner
CREATE POLICY "member_select_own" ON member_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Allow SELECT for managers and chairman
CREATE POLICY "staff_select_all" ON member_applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- 4. Allow UPDATE for managers and chairman
CREATE POLICY "staff_update" ON member_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- Verify the policies
SELECT 
  schemaname,
  tablename, 
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL as has_using,
  with_check IS NOT NULL as has_check
FROM pg_policies 
WHERE tablename = 'member_applications'
ORDER BY policyname;

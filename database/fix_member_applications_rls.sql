-- Fix RLS Policy for Member Applications
-- The issue: Members can't insert their own application because they're not fully authenticated yet

-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Members can create application" ON member_applications;

-- Create a more permissive INSERT policy for new signups
-- Allow INSERT if the user_id matches the authenticated user
CREATE POLICY "Allow signup insert" ON member_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR 
    auth.uid() IS NOT NULL  -- Allow any authenticated user to create application
  );

-- Alternative: Temporarily disable RLS for INSERT, then re-enable with proper policy
-- This is safer for signup flow
DROP POLICY IF EXISTS "Allow signup insert" ON member_applications;

CREATE POLICY "Authenticated users can create application" ON member_applications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Keep the SELECT policy (members view their own)
DROP POLICY IF EXISTS "Members can view own application" ON member_applications;
CREATE POLICY "Members can view own application" ON member_applications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Keep staff SELECT policy
DROP POLICY IF EXISTS "Staff can view all applications" ON member_applications;
CREATE POLICY "Staff can view all applications" ON member_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- Keep staff UPDATE policy
DROP POLICY IF EXISTS "Managers can update applications" ON member_applications;
CREATE POLICY "Managers can update applications" ON member_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- Verify RLS is enabled
ALTER TABLE member_applications ENABLE ROW LEVEL SECURITY;

-- Show all policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'member_applications';

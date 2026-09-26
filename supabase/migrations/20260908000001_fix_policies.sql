-- Fix: Drop and recreate policies to avoid conflicts
-- This migration safely handles existing policies

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own staff record" ON public.staff;
DROP POLICY IF EXISTS "Authenticated users can view all staff" ON public.staff;
DROP POLICY IF EXISTS "Service role can manage staff" ON public.staff;

-- Recreate policies
-- Allow users to read their own staff record
CREATE POLICY "Users can view their own staff record"
  ON public.staff
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated users to view all staff (for directory purposes)
CREATE POLICY "Authenticated users can view all staff"
  ON public.staff
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only allow service role to manage staff
CREATE POLICY "Service role can manage staff"
  ON public.staff
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

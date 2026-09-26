-- TEMPORARY: Disable RLS on member_applications for testing
-- This will allow signup to work while we debug the issue
-- WARNING: Only use this temporarily in development

-- Check current RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'member_applications';

-- Disable RLS temporarily
ALTER TABLE member_applications DISABLE ROW LEVEL SECURITY;

-- Verify it's disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'member_applications';

-- Note: Remember to re-enable with proper policies later:
-- ALTER TABLE member_applications ENABLE ROW LEVEL SECURITY;

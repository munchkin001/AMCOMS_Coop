-- Test if we can actually read from staff table
SELECT * FROM staff WHERE email = 'manager@amcoms.com';

-- Check table permissions
SELECT 
  grantee, 
  privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='staff';

-- Check if there are any RLS policies still active
SELECT * FROM pg_policies WHERE tablename = 'staff';

-- Verify RLS is disabled
SELECT 
  schemaname,
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'staff';

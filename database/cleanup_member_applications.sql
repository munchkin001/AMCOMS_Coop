-- Cleanup script to remove member_applications table and related objects
-- Run this in your Supabase SQL Editor to complete the restoration

-- Drop the member_applications table (this will also drop the trigger)
DROP TABLE IF EXISTS member_applications CASCADE;

-- Drop the trigger functions
DROP FUNCTION IF EXISTS update_member_applications_updated_at() CASCADE;
DROP FUNCTION IF EXISTS create_member_from_application() CASCADE;

-- Verification query - should return no results if cleanup was successful
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'member_applications';

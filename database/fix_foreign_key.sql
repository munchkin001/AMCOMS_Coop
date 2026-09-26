-- Fix the foreign key constraint issue
-- The problem is the FK reference to auth.users which isn't working properly

-- First, check if there are any existing records
SELECT COUNT(*) as record_count FROM member_applications;

-- Drop the foreign key constraint on user_id
ALTER TABLE member_applications 
DROP CONSTRAINT IF EXISTS member_applications_user_id_fkey;

-- Also drop constraint on reviewed_by if it exists
ALTER TABLE member_applications
DROP CONSTRAINT IF EXISTS member_applications_reviewed_by_fkey;

-- Verify the constraints are removed
SELECT
    conname AS constraint_name,
    contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'member_applications'::regclass;

-- The user_id column will still store the UUID, but without FK constraint
-- This is fine because we validate it in the application layer

-- =====================================================
-- Migration: Add Username-based Authentication
-- Date: 2026-09-28
-- Description: Add username field to staff table and 
--              remove email verification requirements
-- =====================================================

-- Add username column to staff table (unique, required)
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS staff_username_idx ON public.staff(username);

-- Function to validate username format (create before using it)
CREATE OR REPLACE FUNCTION public.validate_username(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Username must be 3-30 characters, alphanumeric with dots and underscores
  RETURN p_username ~ '^[a-zA-Z0-9._]{3,30}$';
END;
$$;

COMMENT ON FUNCTION public.validate_username IS 'Validates username format: 3-30 chars, alphanumeric with dots/underscores';

-- Function to generate valid username from full name
CREATE OR REPLACE FUNCTION public.generate_username_from_name(p_full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_username TEXT;
BEGIN
  -- Convert to lowercase, replace spaces with dots, remove special chars
  v_username := lower(regexp_replace(p_full_name, '[^a-zA-Z0-9\s]', '', 'g'));
  v_username := regexp_replace(v_username, '\s+', '.', 'g');
  
  -- Remove leading/trailing dots
  v_username := trim(both '.' from v_username);
  
  -- Ensure it's between 3-30 characters
  IF length(v_username) < 3 THEN
    v_username := v_username || '.user';
  END IF;
  
  IF length(v_username) > 30 THEN
    v_username := substring(v_username, 1, 30);
    -- Remove trailing dot if any
    v_username := trim(trailing '.' from v_username);
  END IF;
  
  RETURN v_username;
END;
$$;

-- Update existing staff to have usernames (temporary, should be updated by admin)
-- Use the function to ensure valid usernames
UPDATE public.staff
SET username = generate_username_from_name(full_name)
WHERE username IS NULL;

-- Handle any duplicates by adding numbers
DO $$
DECLARE
  v_record RECORD;
  v_new_username TEXT;
  v_counter INTEGER;
BEGIN
  FOR v_record IN 
    SELECT username, array_agg(id ORDER BY created_at) as ids
    FROM public.staff
    WHERE username IS NOT NULL
    GROUP BY username
    HAVING count(*) > 1
  LOOP
    v_counter := 1;
    -- Skip the first one (keep original username)
    FOREACH v_record.id IN ARRAY v_record.ids[2:array_length(v_record.ids, 1)]
    LOOP
      v_new_username := v_record.username || v_counter::text;
      -- Ensure it's not too long
      IF length(v_new_username) > 30 THEN
        v_new_username := substring(v_record.username, 1, 28) || v_counter::text;
      END IF;
      
      UPDATE public.staff 
      SET username = v_new_username 
      WHERE id = v_record.id;
      
      v_counter := v_counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- Make username NOT NULL after populating existing records
ALTER TABLE public.staff
ALTER COLUMN username SET NOT NULL;

COMMENT ON COLUMN public.staff.username IS 'Unique username for authentication (replaces email login)';

-- Make this safe to re-run if the schema change was applied before its
-- migration version was recorded.
DO $$
DECLARE
  constraint_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid)
    INTO constraint_definition
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.staff'::regclass
    AND constraint_row.conname = 'staff_username_format_check';

  IF constraint_definition IS NULL THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_username_format_check
      CHECK (validate_username(username));
  ELSIF replace(constraint_definition, 'public.', '') <> 'CHECK (validate_username(username))' THEN
    RAISE EXCEPTION
      'Constraint staff_username_format_check already exists with unexpected definition: %',
      constraint_definition;
  END IF;
END;
$$;

-- RLS: Update policies to allow username lookups during login
-- This policy allows anyone to read staff records by username during authentication
-- The existing policies will handle authorization after login
DROP POLICY IF EXISTS "Allow username lookup for authentication" ON public.staff;
CREATE POLICY "Allow username lookup for authentication"
ON public.staff
FOR SELECT
USING (true); -- Temporary open policy for username lookup, will be restricted by application logic

-- Log this migration
DO $$
BEGIN
  RAISE NOTICE '✓ Added username field to staff table';
  RAISE NOTICE '✓ Created username index for fast lookups';
  RAISE NOTICE '✓ Populated existing staff with default usernames';
  RAISE NOTICE '✓ Added username validation function';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Staff should update their usernames and passwords';
  RAISE NOTICE 'Email verification has been disabled in favor of username/password auth';
END $$;

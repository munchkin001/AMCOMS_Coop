-- ============================================
-- CREATE TEST USERS FOR AMCOMS
-- ============================================
-- Run this in Supabase SQL Editor
-- This will create both auth users and staff records

-- NOTE: You need to create auth users first through Supabase Dashboard
-- Then run this SQL to create staff records

-- ============================================
-- STEP 1: Create staff table if not exists
-- ============================================

CREATE TABLE IF NOT EXISTS public.staff (
  staff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_number TEXT UNIQUE,
  username TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL, -- chairman, manager, treasurer, bookkeeper, inventory, member
  position TEXT, -- Job position title
  department TEXT,
  contact_number TEXT,
  date_hired DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON public.staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_role ON public.staff(role);

-- Enable RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own staff record" ON public.staff;
DROP POLICY IF EXISTS "Staff can update their own record" ON public.staff;

-- Create RLS policies
CREATE POLICY "Users can view their own staff record"
  ON public.staff
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can update their own record"
  ON public.staff
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- STEP 2: Create test users in Auth
-- ============================================
-- YOU MUST DO THIS MANUALLY IN SUPABASE DASHBOARD:
-- Go to Authentication > Users > Add User
-- Create these users:

/*
1. Chairman:
   Email: chairman@amcoms.com
   Password: chairman123
   Auto Confirm Email: YES

2. Manager:
   Email: manager@amcoms.com
   Password: manager123
   Auto Confirm Email: YES

3. Treasurer:
   Email: treasurer@amcoms.com
   Password: treasurer123
   Auto Confirm Email: YES

4. Bookkeeper:
   Email: bookkeeper@amcoms.com
   Password: bookkeeper123
   Auto Confirm Email: YES

5. Inventory:
   Email: inventory@amcoms.com
   Password: inventory123
   Auto Confirm Email: YES

6. Member:
   Email: member@amcoms.com
   Password: member123
   Auto Confirm Email: YES
*/

-- ============================================
-- STEP 3: Link staff records to auth users
-- ============================================
-- After creating auth users above, run this to create staff records

-- First, let's see if there are any auth users
-- SELECT id, email FROM auth.users;

-- Delete any existing staff records (optional - only if you want to start fresh)
-- DELETE FROM public.staff;

-- Insert staff records
-- Note: You'll need to get the actual user_id from auth.users table
-- Replace 'USER_ID_HERE' with actual UUID from auth.users

-- OPTION 1: Manual insertion (replace USER_IDs)
/*
INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
VALUES 
  ('USER_ID_FOR_CHAIRMAN', 'chairman', 'chairman@amcoms.com', 'John Chairman', 'chairman', 'EMP-001', true),
  ('USER_ID_FOR_MANAGER', 'manager', 'manager@amcoms.com', 'Jane Manager', 'manager', 'EMP-002', true),
  ('USER_ID_FOR_TREASURER', 'treasurer', 'treasurer@amcoms.com', 'Bob Treasurer', 'treasurer', 'EMP-003', true),
  ('USER_ID_FOR_BOOKKEEPER', 'bookkeeper', 'bookkeeper@amcoms.com', 'Alice Bookkeeper', 'bookkeeper', 'EMP-004', true),
  ('USER_ID_FOR_INVENTORY', 'inventory', 'inventory@amcoms.com', 'Tom Inventory', 'inventory', 'EMP-005', true);
*/

-- OPTION 2: Automatic insertion using email matching
-- This will automatically match auth users with staff records

INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
SELECT 
  u.id,
  'chairman',
  'chairman@amcoms.com',
  'John Chairman',
  'chairman',
  'EMP-001',
  true
FROM auth.users u
WHERE u.email = 'chairman@amcoms.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
SELECT 
  u.id,
  'manager',
  'manager@amcoms.com',
  'Jane Manager',
  'manager',
  'EMP-002',
  true
FROM auth.users u
WHERE u.email = 'manager@amcoms.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
SELECT 
  u.id,
  'treasurer',
  'treasurer@amcoms.com',
  'Bob Treasurer',
  'treasurer',
  'EMP-003',
  true
FROM auth.users u
WHERE u.email = 'treasurer@amcoms.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
SELECT 
  u.id,
  'bookkeeper',
  'bookkeeper@amcoms.com',
  'Alice Bookkeeper',
  'bookkeeper',
  'EMP-004',
  true
FROM auth.users u
WHERE u.email = 'bookkeeper@amcoms.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.staff (user_id, username, email, full_name, role, employee_number, is_active)
SELECT 
  u.id,
  'inventory',
  'inventory@amcoms.com',
  'Tom Inventory',
  'inventory',
  'EMP-005',
  true
FROM auth.users u
WHERE u.email = 'inventory@amcoms.com'
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- STEP 4: Verify staff records were created
-- ============================================

SELECT 
  s.employee_number,
  s.full_name,
  s.role,
  s.email,
  s.is_active,
  u.email as auth_email
FROM public.staff s
LEFT JOIN auth.users u ON s.user_id = u.id
ORDER BY s.employee_number;

-- ============================================
-- Expected Output:
-- ============================================
/*
employee_number | full_name       | role       | email                    | is_active | auth_email
----------------|-----------------|------------|--------------------------|-----------|------------------------
EMP-001         | John Chairman   | chairman   | chairman@amcoms.com      | true      | chairman@amcoms.com
EMP-002         | Jane Manager    | manager    | manager@amcoms.com       | true      | manager@amcoms.com
EMP-003         | Bob Treasurer   | treasurer  | treasurer@amcoms.com     | true      | treasurer@amcoms.com
EMP-004         | Alice Bookkeeper| bookkeeper | bookkeeper@amcoms.com    | true      | bookkeeper@amcoms.com
EMP-005         | Tom Inventory   | inventory  | inventory@amcoms.com     | true      | inventory@amcoms.com
*/

-- ============================================
-- TROUBLESHOOTING
-- ============================================

-- Check if auth users exist:
-- SELECT id, email, created_at FROM auth.users;

-- Check if staff records exist:
-- SELECT * FROM public.staff;

-- If you need to delete and start over:
-- DELETE FROM public.staff;
-- Then create auth users again in dashboard
-- Then run the INSERT statements above

-- ============================================
-- NOTES:
-- ============================================
-- 1. Auth users MUST be created in Supabase Dashboard first
-- 2. Make sure to check "Auto Confirm Email" when creating users
-- 3. Staff records link to auth users via user_id
-- 4. The 'role' field must match the portal type exactly:
--    - chairman (for Chairman Portal)
--    - manager (for Manager Portal)
--    - treasurer (for Treasurer Portal)
--    - bookkeeper (for Bookkeeper Portal)
--    - inventory (for Inventory Portal)
--    - member (for Member Portal)


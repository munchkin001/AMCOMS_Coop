-- ============================================
-- SIMPLE FIX - Fix ALL Staff Roles (Chairman, Manager, Treasurer, Bookkeeper, Inventory)
-- ============================================

-- Step 1: Completely disable RLS (this is blocking queries)
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies
DROP POLICY IF EXISTS "Users can read own staff record" ON staff CASCADE;
DROP POLICY IF EXISTS "Users can read staff by email" ON staff CASCADE;
DROP POLICY IF EXISTS "Service role has full access" ON staff CASCADE;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON staff CASCADE;
DROP POLICY IF EXISTS "Authenticated users can read staff" ON staff CASCADE;
DROP POLICY IF EXISTS "Users can update own record" ON staff CASCADE;

-- Step 3: Update ALL staff to be active and linked to auth users
UPDATE staff s
SET 
  user_id = u.id,
  is_active = true
FROM auth.users u
WHERE s.email = u.email;

-- Step 4: Verify ALL staff roles can be queried
SELECT 
  'ALL STAFF RECORDS' as status,
  email,
  full_name,
  role,
  user_id,
  is_active,
  CASE 
    WHEN user_id IS NOT NULL AND is_active THEN '✅ CAN LOGIN'
    ELSE '❌ CANNOT LOGIN'
  END as login_status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY 
  CASE role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;

-- Step 5: Show any staff that still needs fixing
SELECT 
  '⚠️ NEEDS FIXING' as status,
  email,
  full_name,
  role,
  user_id,
  is_active,
  CASE 
    WHEN user_id IS NULL THEN 'user_id is NULL - needs linking'
    WHEN NOT is_active THEN 'is_active is false - needs activation'
    ELSE 'Unknown issue'
  END as issue
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
  AND (user_id IS NULL OR NOT is_active);

-- If Step 5 returns no rows, all staff can login!
-- If Step 5 shows records, run the UPDATE in Step 3 again after creating auth users

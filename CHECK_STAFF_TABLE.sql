-- Check the staff table structure and data
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'staff'
ORDER BY ordinal_position;

-- Check actual staff data
SELECT 
  id,
  email,
  full_name,
  role,
  position,
  user_id,
  is_active,
  member_id
FROM staff
WHERE email = 'manager@amcoms.com';

-- Check if there are ANY staff records
SELECT 
  email,
  role,
  user_id,
  is_active
FROM staff
ORDER BY email;

-- Get all columns in staff table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'staff'
ORDER BY ordinal_position;

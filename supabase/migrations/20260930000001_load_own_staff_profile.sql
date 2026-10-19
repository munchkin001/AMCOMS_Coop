-- The live database has authenticated accounts but no staff profiles, and an
-- older SELECT policy recursively queries public.staff. Seed only the six
-- explicitly defined AMCOMS test accounts and restrict profile reads to the
-- authenticated user's own row.
DO $$
DECLARE
  known_account_count INTEGER;
  member_account_count INTEGER;
  member_record_count INTEGER;
BEGIN
  SELECT count(*)
    INTO known_account_count
  FROM auth.users
  WHERE lower(email) IN (
    'chairman@amcoms.com',
    'manager@amcoms.com',
    'treasurer@amcoms.com',
    'bookkeeper@amcoms.com',
    'inventory@amcoms.com',
    'member@amcoms.com'
  );

  SELECT count(*)
    INTO member_account_count
  FROM auth.users
  WHERE lower(email) = 'member@amcoms.com';

  SELECT count(*)
    INTO member_record_count
  FROM public.members
  WHERE lower(email) = 'member@amcoms.com';

  IF known_account_count > 0
     AND (known_account_count <> 6 OR member_account_count <> 1 OR member_record_count <> 1) THEN
    RAISE EXCEPTION
      'Expected six known Auth accounts and one matching member account/profile; found %, %, %',
      known_account_count, member_account_count, member_record_count;
  END IF;
END;
$$;
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active, member_id)
SELECT
  u.id,
  mapping.username,
  u.email,
  CASE
    WHEN mapping.role = 'member' THEN concat_ws(' ', m.first_name, m.last_name)
    ELSE mapping.display_name
  END,
  mapping.role,
  true,
  CASE WHEN mapping.role = 'member' THEN m.id ELSE NULL END
FROM auth.users u
JOIN (VALUES
  ('chairman@amcoms.com', 'chairman', 'chairman', 'Chairman'),
  ('manager@amcoms.com', 'manager', 'manager', 'Manager'),
  ('treasurer@amcoms.com', 'treasurer', 'treasurer', 'Treasurer'),
  ('bookkeeper@amcoms.com', 'bookkeeper', 'bookkeeper', 'Bookkeeper'),
  ('inventory@amcoms.com', 'inventory', 'inventory', 'Inventory'),
  ('member@amcoms.com', 'member', 'member', 'Member')
) AS mapping(email, username, role, display_name)
  ON lower(u.email) = mapping.email
LEFT JOIN public.members m
  ON mapping.role = 'member'
  AND lower(m.email) = lower(u.email)
ON CONFLICT (user_id) DO NOTHING;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view all staff" ON public.staff;
DROP POLICY IF EXISTS "Users can view own staff record" ON public.staff;
DROP POLICY IF EXISTS "Users can view their own staff record" ON public.staff;
CREATE POLICY "Users can view own staff record"
  ON public.staff FOR SELECT
  USING (user_id = auth.uid());

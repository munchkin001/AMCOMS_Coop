BEGIN;

DO $$
DECLARE
  matching_auth_users INTEGER;
BEGIN
  SELECT count(DISTINCT lower(email))
  INTO matching_auth_users
  FROM auth.users
  WHERE lower(email) IN (
    'chairman@amcoms.com',
    'manager@amcoms.com',
    'treasurer@amcoms.com',
    'bookkeeper@amcoms.com',
    'inventory@amcoms.com'
  );

  IF matching_auth_users <> 5 THEN
    RAISE EXCEPTION
      'Expected all 5 existing staff Auth users before creating staff profiles; found %',
      matching_auth_users;
  END IF;
END;
$$;

WITH staff_accounts(role, email, username, full_name) AS (
  VALUES
    ('chairman', 'chairman@amcoms.com', 'chairman', 'Carlito Labial'),
    ('manager', 'manager@amcoms.com', 'manager', 'Isabelita Labial'),
    ('treasurer', 'treasurer@amcoms.com', 'treasurer', 'Eulalia Andoy'),
    ('bookkeeper', 'bookkeeper@amcoms.com', 'bookkeeper', 'Joan Mae Madrazo'),
    ('inventory', 'inventory@amcoms.com', 'inventory', 'Joan Mae Madrazo')
)
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
SELECT auth_user.id, account.username, auth_user.email, account.full_name, account.role, true
FROM auth.users AS auth_user
JOIN staff_accounts AS account
  ON lower(auth_user.email) = account.email
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = timezone('utc'::text, now());

WITH staff_accounts(email, full_name) AS (
  VALUES
    ('chairman@amcoms.com', 'Carlito Labial'),
    ('manager@amcoms.com', 'Isabelita Labial'),
    ('treasurer@amcoms.com', 'Eulalia Andoy'),
    ('bookkeeper@amcoms.com', 'Joan Mae Madrazo'),
    ('inventory@amcoms.com', 'Joan Mae Madrazo')
)
UPDATE auth.users AS auth_user
SET raw_user_meta_data = COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', account.full_name)
FROM staff_accounts AS account
WHERE lower(auth_user.email) = account.email;

CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT
      lower(regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', ' ', 'g')) AS value
  ),
  username_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff s
    CROSS JOIN normalized n
    WHERE n.value <> ''
      AND lower(s.username) = n.value
  ),
  name_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff s
    CROSS JOIN normalized n
    WHERE n.value <> ''
      AND lower(regexp_replace(btrim(s.full_name), '\s+', ' ', 'g')) = n.value
  )
  SELECT login_match.email, login_match.is_active
  FROM (
    SELECT um.email, um.is_active
    FROM username_matches um
    UNION ALL
    SELECT nm.email, nm.is_active
    FROM name_matches nm
    WHERE NOT EXISTS (SELECT 1 FROM username_matches)
  ) AS login_match
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

COMMIT;

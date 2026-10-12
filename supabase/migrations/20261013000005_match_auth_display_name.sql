BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH normalized AS (
    SELECT
      lower(btrim(coalesce(p_identifier, ''))) AS username,
      lower(regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', ' ', 'g')) AS full_name
  ),
  username_matches AS (
    SELECT DISTINCT
      COALESCE(auth_user.email, staff.email) AS email,
      staff.is_active
    FROM public.staff AS staff
    LEFT JOIN auth.users AS auth_user ON auth_user.id = staff.user_id
    CROSS JOIN normalized
    WHERE normalized.username <> ''
      AND lower(btrim(staff.username)) = normalized.username
      AND COALESCE(auth_user.email, staff.email) IS NOT NULL
  ),
  name_matches AS (
    SELECT DISTINCT
      COALESCE(auth_user.email, staff.email) AS email,
      staff.is_active
    FROM public.staff AS staff
    LEFT JOIN auth.users AS auth_user ON auth_user.id = staff.user_id
    CROSS JOIN normalized
    WHERE normalized.full_name <> ''
      AND COALESCE(auth_user.email, staff.email) IS NOT NULL
      AND (
        lower(regexp_replace(btrim(COALESCE(staff.full_name, '')), '\s+', ' ', 'g')) = normalized.full_name
        OR lower(regexp_replace(btrim(COALESCE(auth_user.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g')) = normalized.full_name
        OR lower(regexp_replace(btrim(COALESCE(auth_user.raw_user_meta_data ->> 'display_name', '')), '\s+', ' ', 'g')) = normalized.full_name
      )
  )
  SELECT matched.email, matched.is_active
  FROM (
    SELECT username_match.email, username_match.is_active
    FROM username_matches AS username_match
    UNION ALL
    SELECT name_match.email, name_match.is_active
    FROM name_matches AS name_match
    WHERE NOT EXISTS (SELECT 1 FROM username_matches)
  ) AS matched
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

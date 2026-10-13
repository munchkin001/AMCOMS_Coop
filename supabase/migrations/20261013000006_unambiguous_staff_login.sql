BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT lower(regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', ' ', 'g')) AS value
  ),
  username_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff AS s
    CROSS JOIN normalized AS n
    WHERE n.value <> ''
      AND lower(btrim(s.username)) = n.value
      AND s.email IS NOT NULL
  ),
  name_matches AS (
    SELECT s.email, s.is_active
    FROM public.staff AS s
    CROSS JOIN normalized AS n
    WHERE n.value <> ''
      AND lower(regexp_replace(btrim(s.full_name), '\s+', ' ', 'g')) = n.value
      AND s.email IS NOT NULL
  )
  SELECT matched.email, matched.is_active
  FROM (
    SELECT um.email, um.is_active
    FROM username_matches AS um
    UNION ALL
    SELECT nm.email, nm.is_active
    FROM name_matches AS nm
    WHERE NOT EXISTS (SELECT 1 FROM username_matches)
  ) AS matched
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

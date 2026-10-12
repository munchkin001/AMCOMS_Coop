CREATE OR REPLACE FUNCTION public.lookup_staff_login(p_identifier TEXT)
RETURNS TABLE (email TEXT, is_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT lower(regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', ' ', 'g')) AS full_name
  )
  SELECT s.email, s.is_active
  FROM public.staff s
  CROSS JOIN normalized n
  WHERE n.full_name <> ''
    AND lower(regexp_replace(btrim(s.full_name), '\s+', ' ', 'g')) = n.full_name
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.lookup_staff_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_staff_login(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bookkeeper_member_account_status(p_member_ids UUID[])
RETURNS TABLE (
  member_id UUID,
  has_account BOOLEAN,
  is_active BOOLEAN,
  must_change_password BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can view member account status';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (s.member_id)
    s.member_id,
    s.user_id IS NOT NULL,
    s.is_active,
    s.must_change_password
  FROM public.staff s
  WHERE s.role = 'member'
    AND s.member_id = ANY(COALESCE(p_member_ids, ARRAY[]::UUID[]))
  ORDER BY s.member_id, s.is_active DESC, (s.user_id IS NOT NULL) DESC, s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_member_account_status(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_member_account_status(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
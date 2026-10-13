BEGIN;

DROP FUNCTION IF EXISTS public.bookkeeper_member_account_status(UUID[]);

CREATE FUNCTION public.bookkeeper_member_account_status(p_member_ids UUID[])
RETURNS TABLE (
  member_id UUID,
  has_account BOOLEAN,
  is_active BOOLEAN,
  must_change_password BOOLEAN,
  username TEXT
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
    s.must_change_password,
    s.username
  FROM public.staff AS s
  WHERE s.role = 'member'
    AND s.member_id = ANY(COALESCE(p_member_ids, ARRAY[]::UUID[]))
  ORDER BY s.member_id, s.is_active DESC, (s.user_id IS NOT NULL) DESC, s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_member_account_status(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_member_account_status(UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.bookkeeper_update_member_username(
  p_member_id UUID,
  p_username TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  username_value TEXT := lower(trim(p_username));
  member_staff public.staff%ROWTYPE;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can update member usernames';
  END IF;
  IF username_value IS NULL OR username_value !~ '^[a-z0-9._]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers, dots, and underscores';
  END IF;

  SELECT s.* INTO member_staff
  FROM public.staff AS s
  WHERE s.member_id = p_member_id
    AND s.role = 'member'
    AND s.user_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No linked member portal account was found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff AS s
    WHERE lower(s.username) = username_value
      AND s.id <> member_staff.id
  ) THEN
    RAISE EXCEPTION 'This username is already taken';
  END IF;

  UPDATE public.staff
  SET username = username_value,
      updated_at = timezone('utc'::text, now())
  WHERE id = member_staff.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_update_member_username(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_update_member_username(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

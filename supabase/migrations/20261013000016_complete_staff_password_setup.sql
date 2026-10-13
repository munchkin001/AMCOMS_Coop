CREATE OR REPLACE FUNCTION public.complete_own_staff_password_setup()
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  updated_staff_id UUID;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to complete password setup';
  END IF;

  UPDATE public.staff
  SET must_change_password = false,
      updated_at = timezone('utc'::TEXT, now())
  WHERE user_id = authenticated_user_id
    AND is_active = true
    AND role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
    AND must_change_password = true
  RETURNING id INTO updated_staff_id;

  IF updated_staff_id IS NULL THEN
    RAISE EXCEPTION 'No active staff password setup is pending for this account';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_own_staff_password_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_own_staff_password_setup() TO authenticated;

COMMENT ON FUNCTION public.complete_own_staff_password_setup() IS
  'Clears the first-login password-change requirement for the authenticated active staff account only.';

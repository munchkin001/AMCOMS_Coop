CREATE OR REPLACE FUNCTION public.sync_confirmed_auth_email_to_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.staff
    SET email = NEW.email,
        updated_at = now()
    WHERE user_id = NEW.id
      AND email IS DISTINCT FROM NEW.email;

    UPDATE public.members m
    SET email = NEW.email
    FROM public.staff s
    WHERE s.user_id = NEW.id
      AND s.member_id = m.id
      AND m.email IS DISTINCT FROM NEW.email;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_confirmed_auth_email_to_profiles ON auth.users;
CREATE TRIGGER sync_confirmed_auth_email_to_profiles
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_confirmed_auth_email_to_profiles();
COMMENT ON FUNCTION public.sync_confirmed_auth_email_to_profiles() IS
  'Synchronizes a confirmed Supabase Auth email to the linked staff and member contact records.';

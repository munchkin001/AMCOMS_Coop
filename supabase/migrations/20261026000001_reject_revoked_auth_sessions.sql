CREATE OR REPLACE FUNCTION public.enforce_active_auth_session()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF NULLIF(auth.jwt()->>'session_id', '') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    v_session_id := (auth.jwt()->>'session_id')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE SQLSTATE 'PT401' USING MESSAGE = 'Invalid authentication session';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS auth_session
    WHERE auth_session.id = v_session_id
  ) THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'Authentication session has been revoked';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_auth_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_active_auth_session()
  TO authenticator, anon, authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.enforce_active_auth_session';
NOTIFY pgrst, 'reload config';

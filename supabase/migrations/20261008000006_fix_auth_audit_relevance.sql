-- Ensure authentication events are included in the audit log view.
CREATE OR REPLACE FUNCTION public.record_auth_event(p_event TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  actor_staff_id UUID;
  normalized_event TEXT := lower(trim(p_event));
  action_label TEXT;
BEGIN
  IF normalized_event NOT IN ('sign in', 'sign out', 'password changed', 'password reset completed') THEN
    RAISE EXCEPTION 'Unsupported authentication audit event';
  END IF;

  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record this event';
  END IF;

  SELECT s.id
    INTO actor_staff_id
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id
    AND s.is_active = true
  LIMIT 1;

  IF actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'An active account is required to record this event';
  END IF;

  action_label := CASE normalized_event
    WHEN 'sign in' THEN 'Signed in'
    WHEN 'sign out' THEN 'Signed out'
    WHEN 'password changed' THEN 'PASSWORD_CHANGED'
    ELSE 'PASSWORD_RESET_COMPLETED'
  END;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_data, user_agent, is_relevant
  ) VALUES (
    actor_staff_id,
    action_label,
    'authentication',
    authenticated_user_id,
    jsonb_build_object('event', normalized_event),
    NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent',
    normalized_event IN ('sign in', 'sign out')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';

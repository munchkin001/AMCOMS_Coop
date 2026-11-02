DROP FUNCTION IF EXISTS public.record_auth_event(TEXT);

CREATE FUNCTION public.record_auth_event(
  p_event TEXT,
  p_device_model TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  actor_staff_id UUID;
  actor_role TEXT;
  normalized_event TEXT := lower(trim(p_event));
  action_label TEXT;
  user_agent_value TEXT;
  device_model_value TEXT := NULLIF(trim(p_device_model), '');
  event_data JSONB;
BEGIN
  IF normalized_event NOT IN ('sign in', 'sign out', 'password changed', 'password reset completed') THEN
    RAISE EXCEPTION 'Unsupported authentication audit event';
  END IF;

  IF device_model_value IS NOT NULL AND char_length(device_model_value) > 100 THEN
    RAISE EXCEPTION 'Device model must not exceed 100 characters';
  END IF;

  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record this event';
  END IF;

  SELECT s.id, s.role
    INTO actor_staff_id, actor_role
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id
    AND s.is_active = true
    AND s.role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member')
  LIMIT 1;

  IF actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'An active staff or member profile is required to record this event';
  END IF;

  action_label := CASE normalized_event
    WHEN 'sign in' THEN 'Signed in'
    WHEN 'sign out' THEN 'Signed out'
    WHEN 'password changed' THEN 'PASSWORD_CHANGED'
    ELSE 'PASSWORD_RESET_COMPLETED'
  END;
  user_agent_value := NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent';
  event_data := jsonb_build_object('event', normalized_event);

  IF normalized_event = 'sign in' AND device_model_value IS NOT NULL THEN
    event_data := event_data || jsonb_build_object('device_model', device_model_value);
  END IF;

  IF actor_role = 'member' THEN
    INSERT INTO public.member_audit_logs (
      member_id, auth_user_id, action, table_name, record_id, new_data,
      user_agent, created_at
    ) VALUES (
      actor_staff_id, authenticated_user_id, action_label, 'authentication',
      authenticated_user_id, event_data, user_agent_value, now()
    );
  ELSE
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_data, user_agent, is_relevant
    ) VALUES (
      actor_staff_id, action_label, 'authentication', authenticated_user_id,
      event_data, user_agent_value, true
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_event(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';

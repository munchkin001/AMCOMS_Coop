CREATE TABLE IF NOT EXISTS public.member_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  auth_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_audit_logs_member_created_idx
  ON public.member_audit_logs (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_audit_logs_created_idx
  ON public.member_audit_logs (created_at DESC);

INSERT INTO public.member_audit_logs (
  id, member_id, auth_user_id, action, table_name, record_id,
  old_data, new_data, user_agent, created_at
)
SELECT
  al.id, s.id, s.user_id, al.action, al.table_name, al.record_id,
  al.old_data, al.new_data, al.user_agent, al.created_at
FROM public.audit_logs al
JOIN public.staff s ON s.id = al.user_id
WHERE s.role = 'member'
  AND s.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.member_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own audit logs" ON public.member_audit_logs;
CREATE POLICY "Members can view own audit logs"
  ON public.member_audit_logs FOR SELECT
  USING (auth_user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.member_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.member_audit_logs FROM PUBLIC, anon;
GRANT SELECT ON public.member_audit_logs TO authenticated;

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
CREATE POLICY "Staff can view own audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    user_id = public.get_staff_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = audit_logs.user_id AND s.role <> 'member'
    )
  );

DROP POLICY IF EXISTS "Chairman and manager can view all audit logs" ON public.audit_logs;
CREATE POLICY "Chairman and manager can view staff audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.has_any_role(ARRAY['chairman', 'manager'])
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = audit_logs.user_id AND s.role <> 'member'
    )
  );

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_staff_id UUID;
  actor_role TEXT;
  old_row JSONB;
  new_row JSONB;
  row_id_text TEXT;
  audit_record_id UUID;
  action_label TEXT;
  user_agent_value TEXT;
BEGIN
  SELECT s.id, s.role
    INTO actor_staff_id, actor_role
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND s.is_active = true
  LIMIT 1;

  IF actor_staff_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_row := to_jsonb(OLD) - ARRAY[
      'password', 'encrypted_password', 'password_hash', 'access_token',
      'refresh_token', 'confirmation_token', 'recovery_token',
      'email_change_token_new', 'email_change_token_current',
      'phone_change_token', 'reauthentication_token', 'api_key', 'secret'
    ]::TEXT[];
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_row := to_jsonb(NEW) - ARRAY[
      'password', 'encrypted_password', 'password_hash', 'access_token',
      'refresh_token', 'confirmation_token', 'recovery_token',
      'email_change_token_new', 'email_change_token_current',
      'phone_change_token', 'reauthentication_token', 'api_key', 'secret'
    ]::TEXT[];
  END IF;

  row_id_text := COALESCE(new_row ->> 'id', old_row ->> 'id');
  IF row_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    audit_record_id := row_id_text::UUID;
  END IF;

  action_label := CASE TG_OP
    WHEN 'INSERT' THEN 'Created ' || TG_TABLE_NAME
    WHEN 'UPDATE' THEN 'Updated ' || TG_TABLE_NAME
    WHEN 'DELETE' THEN 'Deleted ' || TG_TABLE_NAME
  END;
  user_agent_value := NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent';

  IF actor_role = 'member' THEN
    INSERT INTO public.member_audit_logs (
      member_id, auth_user_id, action, table_name, record_id,
      old_data, new_data, user_agent, created_at
    ) VALUES (
      actor_staff_id, auth.uid(), action_label, TG_TABLE_NAME, audit_record_id,
      old_row, new_row, user_agent_value, now()
    );
  ELSE
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_data, new_data,
      user_agent, created_at, is_relevant
    ) VALUES (
      actor_staff_id, action_label, TG_TABLE_NAME, audit_record_id,
      old_row, new_row, user_agent_value, now(), true
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

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
  actor_role TEXT;
  normalized_event TEXT := lower(trim(p_event));
  action_label TEXT;
  user_agent_value TEXT;
BEGIN
  IF normalized_event NOT IN ('sign in', 'sign out', 'password changed', 'password reset completed') THEN
    RAISE EXCEPTION 'Unsupported authentication audit event';
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

  IF actor_role = 'member' THEN
    INSERT INTO public.member_audit_logs (
      member_id, auth_user_id, action, table_name, record_id, new_data,
      user_agent, created_at
    ) VALUES (
      actor_staff_id, authenticated_user_id, action_label, 'authentication',
      authenticated_user_id, jsonb_build_object('event', normalized_event),
      user_agent_value, now()
    );
  ELSE
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_data, user_agent, is_relevant
    ) VALUES (
      actor_staff_id, action_label, 'authentication', authenticated_user_id,
      jsonb_build_object('event', normalized_event), user_agent_value, true
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'member_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_audit_logs;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

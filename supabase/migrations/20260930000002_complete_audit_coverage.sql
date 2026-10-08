-- Complete row-level audit coverage and record authenticated session events.
-- Audit rows are written only by SECURITY DEFINER triggers/functions; clients
-- cannot forge or alter the audit trail directly.

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_staff_id UUID;
  old_row JSONB;
  new_row JSONB;
  row_id_text TEXT;
  audit_record_id UUID;
BEGIN
  SELECT s.id
    INTO actor_staff_id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;

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

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    user_agent, created_at
  ) VALUES (
    actor_staff_id,
    CASE TG_OP
      WHEN 'INSERT' THEN 'Created ' || TG_TABLE_NAME
      WHEN 'UPDATE' THEN 'Updated ' || TG_TABLE_NAME
      WHEN 'DELETE' THEN 'Deleted ' || TG_TABLE_NAME
    END,
    TG_TABLE_NAME,
    audit_record_id,
    old_row,
    new_row,
    NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent',
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
COMMENT ON FUNCTION public.audit_trigger() IS
  'Captures INSERT, UPDATE, and DELETE rows for public tables with credential/token fields redacted.';
DO $$
DECLARE
  target_table RECORD;
  audit_policy RECORD;
  existing_trigger RECORD;
BEGIN
  FOR existing_trigger IN
    SELECT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgfoid = 'public.audit_trigger()'::REGPROCEDURE
      AND c.relname <> 'audit_logs'
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON public.%I',
      existing_trigger.tgname,
      existing_trigger.relname
    );
  END LOOP;

  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'audit_logs'
      AND c.relname <> '_migrations'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_row_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
      target_table.relname
    );
  END LOOP;

  FOR audit_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_logs', audit_policy.policyname);
  END LOOP;
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
  normalized_event TEXT := lower(trim(p_event));
BEGIN
  IF normalized_event NOT IN ('sign in', 'sign out') THEN
    RAISE EXCEPTION 'Unsupported authentication audit event';
  END IF;

  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record this event';
  END IF;

  SELECT s.id
    INTO actor_staff_id
  FROM public.staff s
  WHERE s.user_id = authenticated_user_id
  LIMIT 1;

  IF actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'An active staff profile is required to record this event';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_data, user_agent
  ) VALUES (
    actor_staff_id,
    CASE normalized_event WHEN 'sign in' THEN 'Signed in' ELSE 'Signed out' END,
    'authentication',
    authenticated_user_id,
    jsonb_build_object('event', normalized_event),
    NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_auth_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';

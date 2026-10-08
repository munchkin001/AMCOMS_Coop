-- Keep only business-record changes and account access events in the audit UI.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS is_relevant BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.audit_logs
  ALTER COLUMN is_relevant SET DEFAULT false;
UPDATE public.audit_logs
SET is_relevant = COALESCE(
  user_id IS NOT NULL
  AND (
    (table_name = 'authentication' AND action IN ('Signed in', 'Signed out'))
    OR (
      table_name = ANY(ARRAY[
        'accounts', 'announcements', 'cash_disbursements', 'cash_disbursement_lines',
        'cash_receipts', 'cash_receipt_lines', 'chart_of_accounts', 'documents',
        'general_journal', 'general_ledger', 'journal_entries', 'journal_entry_lines',
        'loan_applications', 'loan_payments', 'loan_products', 'loans',
        'member_applications', 'members', 'products', 'product_categories',
        'production_records', 'purchase_items', 'purchases', 'requests',
        'sales_order_items', 'sales_orders', 'savings_accounts', 'savings_transactions',
        'staff', 'stock_inventory', 'stock_movements', 'suppliers', 'system_settings'
      ]::TEXT[])
      AND action ~ '^(Created|Updated|Deleted) '
    )
  ),
  false
)
WHERE is_relevant IS DISTINCT FROM COALESCE(
  user_id IS NOT NULL
  AND (
    (table_name = 'authentication' AND action IN ('Signed in', 'Signed out'))
    OR (
      table_name = ANY(ARRAY[
        'accounts', 'announcements', 'cash_disbursements', 'cash_disbursement_lines',
        'cash_receipts', 'cash_receipt_lines', 'chart_of_accounts', 'documents',
        'general_journal', 'general_ledger', 'journal_entries', 'journal_entry_lines',
        'loan_applications', 'loan_payments', 'loan_products', 'loans',
        'member_applications', 'members', 'products', 'product_categories',
        'production_records', 'purchase_items', 'purchases', 'requests',
        'sales_order_items', 'sales_orders', 'savings_accounts', 'savings_transactions',
        'staff', 'stock_inventory', 'stock_movements', 'suppliers', 'system_settings'
      ]::TEXT[])
      AND action ~ '^(Created|Updated|Deleted) '
    )
  ),
  false
);
CREATE INDEX IF NOT EXISTS audit_logs_relevance_archive_month_idx
  ON public.audit_logs (is_relevant, is_archived, created_at DESC);
-- Keep historical audit evidence, but offer only meaningful archived months.
CREATE OR REPLACE FUNCTION public.get_audit_log_archive_months()
RETURNS TABLE (month_start TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT to_char(
    date_trunc('month', audit_logs.created_at AT TIME ZONE 'Asia/Manila'),
    'YYYY-MM'
  ) AS month_start
  FROM public.audit_logs
  WHERE audit_logs.is_archived = true
    AND audit_logs.is_relevant = true
  ORDER BY month_start DESC;
$$;
-- Only authenticated cooperative users with active staff/member profiles create
-- row-change audit entries; auth events are inserted separately below.
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
    AND s.is_active = true
    AND s.role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member')
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

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    user_agent, created_at, is_relevant
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
    now(),
    true
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
-- Replace the prior all-public-tables trigger set with the business allowlist.
DO $$
DECLARE
  existing_trigger RECORD;
  target_table TEXT;
  target_is_table BOOLEAN;
  relevant_tables TEXT[] := ARRAY[
    'accounts', 'announcements', 'cash_disbursements', 'cash_disbursement_lines',
    'cash_receipts', 'cash_receipt_lines', 'chart_of_accounts', 'documents',
    'general_journal', 'general_ledger', 'journal_entries', 'journal_entry_lines',
    'loan_applications', 'loan_payments', 'loan_products', 'loans',
    'member_applications', 'members', 'products', 'product_categories',
    'production_records', 'purchase_items', 'purchases', 'requests',
    'sales_order_items', 'sales_orders', 'savings_accounts', 'savings_transactions',
    'staff', 'stock_inventory', 'stock_movements', 'suppliers', 'system_settings'
  ];
BEGIN
  FOR existing_trigger IN
    SELECT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgfoid = 'public.audit_trigger()'::REGPROCEDURE
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON public.%I',
      existing_trigger.tgname,
      existing_trigger.relname
    );
  END LOOP;

  FOREACH target_table IN ARRAY relevant_tables
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND c.relkind IN ('r', 'p')
    ) INTO target_is_table;

    IF target_is_table THEN
      EXECUTE format(
        'CREATE TRIGGER audit_row_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
        target_table
      );
    END IF;
  END LOOP;
END;
$$;
-- AuthContext calls this after successful profile validation for both staff
-- and member roles; require the same active account before writing the event.
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
    AND s.is_active = true
    AND s.role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member')
  LIMIT 1;

  IF actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'An active staff or member profile is required to record this event';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_data, user_agent, is_relevant
  ) VALUES (
    actor_staff_id,
    CASE normalized_event WHEN 'sign in' THEN 'Signed in' ELSE 'Signed out' END,
    'authentication',
    authenticated_user_id,
    jsonb_build_object('event', normalized_event),
    NULLIF(current_setting('request.headers', true), '')::JSONB ->> 'user-agent',
    true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_auth_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';

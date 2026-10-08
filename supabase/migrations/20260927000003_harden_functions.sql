-- ============================================
-- AMCOMS: Harden SECURITY DEFINER Functions
-- Migration: 20260927000003
-- ------------------------------------------------------------
-- Two classes of problem are addressed.
--
-- A. MISSING search_path
--    26 functions across migrations 20260908, 20260910000002, 20260910000003
--    and database/member_applications.sql are declared SECURITY DEFINER with
--    no SET search_path. A SECURITY DEFINER function without a pinned
--    search_path can be subverted by any caller able to create objects in a
--    schema that appears on the path: the caller's object shadows the intended
--    one and executes with the function owner's privileges. This is the
--    standard escalation vector for SECURITY DEFINER code.
--
-- B. LOGIC ERRORS
--    - generate_reference_number() parses SPLIT_PART(column_name, '-', 3),
--      i.e. it operates on the *name of a column* rather than on any row
--      value, and it feeds a caller-supplied table_name straight into
--      EXECUTE format(...). It can therefore never return a correct result
--      and it is an injection surface.
--    - get_daily_cash_position() joins two subqueries with ON true, which is
--      a cartesian product. With 3 receipts and 2 disbursements it returns 6
--      rows, so both SUM(cr.amount) and SUM(cd.amount) are multiplied. The
--      "net cash flow" figure it produces is wrong, not merely unavailable.
--    - audit_trigger() has no search_path (covered by section A).
--
-- IDEMPOTENT.
-- ============================================


-- ============================================
-- 1. PIN search_path ON EVERY SECURITY DEFINER FUNCTION
-- ============================================
-- Done dynamically so that functions added by future migrations are covered
-- by re-running this check, and so no signature is missed.
DO $$
DECLARE
  fn RECORD;
  fixed_count INTEGER := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) AS cfg
          WHERE cfg LIKE 'search\_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp', fn.signature
    );
    fixed_count := fixed_count + 1;
  END LOOP;

  RAISE NOTICE 'Pinned search_path on % SECURITY DEFINER function(s).', fixed_count;
END $$;
-- ============================================
-- 2. REPLACE generate_reference_number
-- ============================================
-- The original signature is preserved so nothing that calls it breaks, but the
-- implementation no longer executes caller-supplied identifiers.
--
-- Reference numbers are allocated from the ref_counters table using an
-- upsert, which is atomic and gapless under concurrency. The table_name and
-- column_name arguments are retained for call compatibility but are no longer
-- used to build SQL.
CREATE TABLE IF NOT EXISTS public.ref_counters (
  prefix        TEXT PRIMARY KEY,
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ref_counters IS
  'Gapless, concurrency-safe source for AMCOMS document numbers (OR, DV, JE, LN, ...).';
CREATE OR REPLACE FUNCTION public.generate_reference_number(
  prefix TEXT,
  table_name TEXT DEFAULT NULL,
  column_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_value BIGINT;
  year TEXT := to_char(CURRENT_DATE, 'YYYY');
BEGIN
  IF prefix IS NULL OR prefix = '' THEN
    RAISE EXCEPTION 'generate_reference_number: prefix is required';
  END IF;

  -- Atomic increment. Two concurrent callers get two distinct numbers.
  INSERT INTO public.ref_counters AS rc (prefix, current_value)
  VALUES (prefix, 1)
  ON CONFLICT (prefix)
  DO UPDATE SET current_value = rc.current_value + 1,
                updated_at = now()
  RETURNING current_value INTO next_value;

  -- Format: PREFIX-YYYY-NNNNNN
  RETURN prefix || '-' || year || '-' || lpad(next_value::TEXT, 6, '0');
END;
$$;
COMMENT ON FUNCTION public.generate_reference_number(TEXT, TEXT, TEXT) IS
  'Returns PREFIX-YYYY-NNNNNN from the gapless ref_counters table. table_name and column_name are accepted for call compatibility and are ignored.';
-- ============================================
-- 3. FIX get_daily_cash_position
-- ============================================
-- The original used FULL OUTER JOIN ... ON true, which multiplies the two
-- sides. Replaced with independent scalar subqueries so each total is counted
-- exactly once.
CREATE OR REPLACE FUNCTION public.get_daily_cash_position(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  cash_receipts     DECIMAL(15, 2),
  cash_disbursements DECIMAL(15, 2),
  net_cash_flow     DECIMAL(15, 2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((SELECT SUM(cr.amount)
              FROM public.cash_receipts cr
              WHERE cr.receipt_date = p_date), 0)      AS cash_receipts,
    COALESCE((SELECT SUM(cd.amount)
              FROM public.cash_disbursements cd
              WHERE cd.disbursement_date = p_date), 0) AS cash_disbursements,
    COALESCE((SELECT SUM(cr.amount)
              FROM public.cash_receipts cr
              WHERE cr.receipt_date = p_date), 0)
    - COALESCE((SELECT SUM(cd.amount)
                FROM public.cash_disbursements cd
                WHERE cd.disbursement_date = p_date), 0) AS net_cash_flow;
$$;
COMMENT ON FUNCTION public.get_daily_cash_position(DATE) IS
  'Daily cash receipts, disbursements and net flow. Each side is summed independently; the previous implementation cross-joined and multiplied both totals.';
-- ============================================
-- 4. PIN search_path ON audit_trigger EXPLICITLY
-- ============================================
-- Covered by section 1, but restated so the intent is documented next to the
-- function, and so the body is pinned even if the trigger is recreated.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  staff_id_val  UUID;
  action_desc   TEXT;
  new_id_val    UUID;
  old_id_val    UUID;
BEGIN
  SELECT s.id INTO staff_id_val
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;

  action_desc := CASE TG_OP
    WHEN 'INSERT' THEN 'Created '   || TG_TABLE_NAME
    WHEN 'UPDATE' THEN 'Updated '   || TG_TABLE_NAME
    WHEN 'DELETE' THEN 'Deleted '   || TG_TABLE_NAME
    ELSE TG_OP
  END;

  -- NEW and OLD are NULL depending on the operation, so read them through
  -- to_jsonb rather than referencing NEW.id directly.
  IF TG_OP <> 'INSERT' THEN
    old_id_val := (to_jsonb(OLD) ->> 'id')::UUID;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_id_val := (to_jsonb(NEW) ->> 'id')::UUID;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data
  ) VALUES (
    staff_id_val,
    action_desc,
    TG_TABLE_NAME,
    COALESCE(new_id_val, old_id_val),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
COMMENT ON FUNCTION public.audit_trigger() IS
  'Writes an immutable row to public.audit_logs for every INSERT/UPDATE/DELETE. Runs as owner, so it is unaffected by the removal of the client INSERT policy.';
-- ============================================
-- 5. FLAG get_next_loan_payment
-- ============================================
-- Left functionally unchanged because there is no loan amortisation schedule
-- table yet. It currently reports CURRENT_DATE + 1 month as the due date,
-- which is an assumption rather than a computed value. It must be rewritten
-- against loan_amortization_schedules in the transaction-engine stage.
COMMENT ON FUNCTION public.get_next_loan_payment(UUID) IS
  'WARNING: the due date is assumed to be CURRENT_DATE + 1 month, not read from an amortisation schedule. Replace when loan_amortization_schedules exists.';
-- ============================================
-- 6. VERIFICATION
-- ============================================
DO $$
DECLARE
  unsecured TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::TEXT, E'\n  ')
    INTO unsecured
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (
      p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS cfg
        WHERE cfg LIKE 'search\_path=%'
      )
    );

  IF unsecured IS NOT NULL THEN
    RAISE EXCEPTION
      'SECURITY DEFINER functions still missing search_path:%  %', E'\n  ', unsecured;
  END IF;

  RAISE NOTICE '✓ Migration 20260927000003 completed.';
  RAISE NOTICE '✓ All SECURITY DEFINER functions now pin search_path.';
  RAISE NOTICE '✓ generate_reference_number no longer executes dynamic SQL.';
  RAISE NOTICE '✓ get_daily_cash_position cross-join corrected.';
  RAISE NOTICE '✓ audit_trigger hardened.';
END $$;

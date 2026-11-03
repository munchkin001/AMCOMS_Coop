CREATE TABLE public.cash_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE NOT NULL,
  opening_balance NUMERIC(15, 2) NOT NULL,
  cash_received NUMERIC(15, 2) NOT NULL,
  cash_released NUMERIC(15, 2) NOT NULL,
  expected_closing NUMERIC(15, 2) NOT NULL,
  actual_count NUMERIC(15, 2) NOT NULL CHECK (actual_count >= 0),
  variance NUMERIC(15, 2) NOT NULL,
  remarks TEXT,
  submitted_by UUID NOT NULL REFERENCES public.staff(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(COALESCE(remarks, '')) <= 1000)
);

CREATE INDEX cash_reconciliations_date_submitted_idx
  ON public.cash_reconciliations (reconciliation_date, submitted_at DESC);

ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial managers can view cash reconciliations"
  ON public.cash_reconciliations FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['treasurer', 'manager', 'chairman']));

REVOKE ALL ON public.cash_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cash_reconciliations TO authenticated;

CREATE OR REPLACE FUNCTION public.get_treasurer_cash_position(p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_opening NUMERIC(15, 2);
  v_received NUMERIC(15, 2);
  v_released NUMERIC(15, 2);
  v_expected NUMERIC(15, 2);
  v_account_count INTEGER;
BEGIN
  IF NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only the Treasurer can view the cash reconciliation position';
  END IF;
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Manila')::DATE THEN
    RAISE EXCEPTION 'Choose a reconciliation date that is not in the future';
  END IF;

  SELECT count(*) INTO v_account_count
  FROM public.chart_of_accounts
  WHERE account_type = 'asset'
    AND is_active
    AND lower(trim(account_name)) = 'cash on hand';
  IF v_account_count = 0 THEN
    RAISE EXCEPTION 'The active Cash on Hand ledger account is not configured';
  END IF;

  SELECT
    COALESCE(sum(opening_balance), 0),
    COALESCE(sum(period_debit), 0),
    COALESCE(sum(period_credit), 0),
    COALESCE(sum(closing_balance), 0)
  INTO v_opening, v_received, v_released, v_expected
  FROM public.get_account_balances(p_date, p_date)
  WHERE account_type = 'asset'
    AND lower(trim(account_name)) = 'cash on hand';

  RETURN jsonb_build_object(
    'reconciliation_date', p_date,
    'opening_balance', v_opening,
    'cash_received', v_received,
    'cash_released', v_released,
    'expected_closing', v_expected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_treasurer_cash_position(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treasurer_cash_position(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_treasurer_cash_reconciliation(
  p_date DATE,
  p_actual_count NUMERIC,
  p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_position JSONB;
  v_id UUID;
  v_staff_id UUID := public.current_staff_id();
  v_actual NUMERIC(15, 2);
  v_expected NUMERIC(15, 2);
  v_variance NUMERIC(15, 2);
  v_remarks TEXT := NULLIF(trim(p_remarks), '');
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can submit a cash reconciliation';
  END IF;
  IF p_actual_count IS NULL OR p_actual_count < 0 OR p_actual_count <> round(p_actual_count, 2) THEN
    RAISE EXCEPTION 'Enter a valid actual cash count with no more than two decimal places';
  END IF;
  IF length(COALESCE(v_remarks, '')) > 1000 THEN
    RAISE EXCEPTION 'Reconciliation notes cannot exceed 1000 characters';
  END IF;

  v_position := public.get_treasurer_cash_position(p_date);
  v_actual := p_actual_count;
  v_expected := (v_position->>'expected_closing')::NUMERIC(15, 2);
  v_variance := round(v_actual - v_expected, 2);

  INSERT INTO public.cash_reconciliations (
    reconciliation_date, opening_balance, cash_received, cash_released,
    expected_closing, actual_count, variance, remarks, submitted_by
  ) VALUES (
    p_date,
    (v_position->>'opening_balance')::NUMERIC(15, 2),
    (v_position->>'cash_received')::NUMERIC(15, 2),
    (v_position->>'cash_released')::NUMERIC(15, 2),
    v_expected,
    v_actual,
    v_variance,
    v_remarks,
    v_staff_id
  ) RETURNING id INTO v_id;

  RETURN v_position || jsonb_build_object(
    'id', v_id,
    'actual_count', v_actual,
    'variance', v_variance,
    'remarks', v_remarks,
    'submitted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_treasurer_cash_reconciliation(DATE, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_treasurer_cash_reconciliation(DATE, NUMERIC, TEXT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'cash_reconciliations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_reconciliations;
  END IF;
END;
$$;

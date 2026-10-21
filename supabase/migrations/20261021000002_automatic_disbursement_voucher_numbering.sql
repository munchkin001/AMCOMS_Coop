BEGIN;

CREATE TABLE IF NOT EXISTS public.disbursement_voucher_number_counters (
  voucher_year INTEGER PRIMARY KEY,
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

INSERT INTO public.disbursement_voucher_number_counters (voucher_year, last_number)
SELECT
  substring(voucher_number FROM '^CDV-([0-9]{4})-[0-9]+$')::INTEGER,
  MAX(substring(voucher_number FROM '^CDV-[0-9]{4}-([0-9]+)$')::BIGINT)
FROM public.cash_disbursements
WHERE voucher_number ~ '^CDV-[0-9]{4}-[0-9]+$'
GROUP BY substring(voucher_number FROM '^CDV-([0-9]{4})-[0-9]+$')
ON CONFLICT (voucher_year) DO NOTHING;

ALTER TABLE public.disbursement_voucher_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.disbursement_voucher_number_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_cooperative_disbursement_voucher_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (clock_timestamp() AT TIME ZONE 'Asia/Manila'))::INTEGER;
  v_next BIGINT;
BEGIN
  INSERT INTO public.disbursement_voucher_number_counters (voucher_year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (voucher_year)
  DO UPDATE SET last_number = public.disbursement_voucher_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'CDV-' || v_year::TEXT || '-' || lpad(v_next::TEXT, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_cooperative_disbursement_voucher_number() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.save_cash_disbursement(JSONB, JSONB)
  RENAME TO save_cash_disbursement_before_auto_voucher_number;
REVOKE ALL ON FUNCTION public.save_cash_disbursement_before_auto_voucher_number(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_cash_disbursement(p_disbursement JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT := COALESCE(p_disbursement->>'status', 'recorded');
  v_voucher_number TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash disbursements';
  END IF;
  IF v_status NOT IN ('draft', 'recorded') THEN
    RAISE EXCEPTION 'Unsupported disbursement status';
  END IF;

  IF v_status = 'recorded' THEN
    v_voucher_number := public.next_cooperative_disbursement_voucher_number();
  ELSE
    v_voucher_number := 'DRAFT-' || replace(gen_random_uuid()::TEXT, '-', '');
  END IF;

  v_result := public.save_cash_disbursement_before_auto_voucher_number(
    p_disbursement || jsonb_build_object('voucher_number', v_voucher_number),
    p_allocations
  );

  RETURN v_result || jsonb_build_object('voucher_number', v_voucher_number);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) TO authenticated;

COMMIT;

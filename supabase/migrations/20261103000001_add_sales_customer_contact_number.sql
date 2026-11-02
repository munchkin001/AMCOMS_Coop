ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS customer_contact_number TEXT;

CREATE OR REPLACE FUNCTION public.record_cooperative_sale_with_contact(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_contact_number TEXT := NULLIF(trim(COALESCE(p_sale->>'customer_contact_number', '')), '');
  v_member_id UUID := NULLIF(p_sale->>'member_id', '')::UUID;
  v_order_id UUID;
BEGIN
  IF v_contact_number IS NOT NULL AND length(v_contact_number) > 24 THEN
    RAISE EXCEPTION 'Customer contact number must be 24 characters or fewer';
  END IF;

  v_result := public.record_cooperative_sale(p_sale);
  v_order_id := NULLIF(v_result->>'sales_order_id', '')::UUID;
  IF v_member_id IS NULL AND v_contact_number IS NOT NULL AND v_order_id IS NOT NULL THEN
    UPDATE public.sales_orders
    SET customer_contact_number = v_contact_number
    WHERE id = v_order_id;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cooperative_sale_with_contact(JSONB) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_definition TEXT;
  v_old TEXT := 'v_result := public.record_cooperative_sale(v_payload->''p_sale'');';
  v_new TEXT := 'v_result := public.record_cooperative_sale_with_contact(v_payload->''p_sale'');';
BEGIN
  SELECT pg_get_functiondef('public.process_transaction_workflow(uuid)'::REGPROCEDURE)
  INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely connect non-member sale contacts to the transaction workflow';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

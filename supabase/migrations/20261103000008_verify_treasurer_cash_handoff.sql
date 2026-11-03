CREATE OR REPLACE FUNCTION public.verify_transaction_workflow_cash_received(
  p_workflow_id UUID,
  p_remarks TEXT
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
  v_workflow RECORD;
  v_receipt_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can confirm a cash handoff';
  END IF;

  SELECT business_record_id, business_record_table, amount, payment_method
  INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
    AND direction = 'cash_in'
    AND status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only completed cash-in transactions can be confirmed';
  END IF;
  IF v_workflow.payment_method IS DISTINCT FROM 'cash'
     OR v_workflow.business_record_id IS NULL THEN
    RAISE EXCEPTION 'Only a recorded cash receipt deposited to Cash on Hand can be confirmed as a physical handoff';
  END IF;

  IF v_workflow.business_record_table = 'cash_receipts' THEN
    v_receipt_id := v_workflow.business_record_id;
  ELSIF v_workflow.business_record_table = 'sales_orders' THEN
    SELECT cash_receipt_id INTO v_receipt_id
    FROM public.sales_orders
    WHERE id = v_workflow.business_record_id;
  END IF;

  IF v_receipt_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.cash_receipts AS receipt
    JOIN public.chart_of_accounts AS cash_account
      ON cash_account.id = receipt.account_id
    WHERE receipt.id = v_receipt_id
      AND receipt.status = 'recorded'
      AND receipt.payment_method = 'cash'
      AND receipt.amount = v_workflow.amount
      AND cash_account.account_type = 'asset'
      AND cash_account.is_active
      AND lower(trim(cash_account.account_name)) = 'cash on hand'
  ) THEN
    RAISE EXCEPTION 'Only a recorded cash receipt deposited to Cash on Hand can be confirmed as a physical handoff';
  END IF;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id, remarks
  ) VALUES (
    p_workflow_id,
    'cash_received_verified',
    'completed',
    'completed',
    v_auth_id,
    v_staff_id,
    NULLIF(trim(p_remarks), '')
  )
  ON CONFLICT (workflow_id) WHERE event_type = 'cash_received_verified'
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_transaction_workflow_cash_received(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_transaction_workflow_cash_received(UUID, TEXT) TO authenticated;

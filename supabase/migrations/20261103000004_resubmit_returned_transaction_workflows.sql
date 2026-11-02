BEGIN;

CREATE OR REPLACE FUNCTION public.resubmit_returned_transaction_workflow(
  p_workflow_id UUID,
  p_counterparty_name TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_description TEXT,
  p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_id UUID := auth.uid();
  v_staff_id UUID := public.current_staff_id();
  v_workflow public.transaction_workflows%ROWTYPE;
  v_result JSONB;
  v_new_workflow_id UUID;
BEGIN
  IF v_auth_id IS NULL OR v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can correct a returned transaction';
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_workflow.status <> 'returned_for_correction'
     OR v_workflow.superseded_by IS NOT NULL
     OR v_workflow.created_by_auth_id <> v_auth_id THEN
    RAISE EXCEPTION 'This returned transaction is no longer available for correction by this Bookkeeper';
  END IF;
  IF v_workflow.direction = 'cash_in' THEN
    RAISE EXCEPTION 'Automatically recorded cash-in transactions cannot be resubmitted for Manager approval';
  END IF;

  UPDATE public.transaction_workflows
  SET source_record_id = NULL,
      updated_at = now()
  WHERE id = v_workflow.id;

  v_result := public.submit_transaction_workflow(
    gen_random_uuid(),
    v_workflow.transaction_type,
    v_workflow.direction,
    v_workflow.source_module,
    v_workflow.source_record_id,
    v_workflow.member_id,
    p_counterparty_name,
    p_amount,
    p_payment_method,
    p_description,
    p_payload
  );
  v_new_workflow_id := NULLIF(v_result->>'workflow_id', '')::UUID;
  IF v_new_workflow_id IS NULL THEN
    RAISE EXCEPTION 'The corrected transaction was not submitted for review';
  END IF;

  UPDATE public.transaction_workflows
  SET superseded_by = v_new_workflow_id,
      updated_at = now()
  WHERE id = v_workflow.id;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, next_status, actor_auth_id, actor_staff_id,
    remarks, snapshot
  ) VALUES (
    v_new_workflow_id, 'resubmitted', 'pending_approval', v_auth_id, v_staff_id,
    v_workflow.manager_remarks,
    jsonb_build_object(
      'previous_workflow_id', v_workflow.id,
      'previous_amount', v_workflow.amount,
      'manager_remarks', v_workflow.manager_remarks
    )
  );

  RETURN jsonb_build_object(
    'workflow_id', v_new_workflow_id,
    'status', 'pending_approval',
    'superseded_workflow_id', v_workflow.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_returned_transaction_workflow(UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_returned_transaction_workflow(UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB)
  TO authenticated;

COMMIT;

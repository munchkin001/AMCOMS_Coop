BEGIN;

CREATE OR REPLACE FUNCTION public.retry_transaction_workflow_processing(
  p_workflow_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_workflow public.transaction_workflows%ROWTYPE;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can retry transaction processing';
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;
  IF NOT FOUND OR v_workflow.status <> 'accounting_error' THEN
    RAISE EXCEPTION 'Only a transaction with a failed accounting attempt can be retried';
  END IF;
  IF v_workflow.cash_release_required THEN
    RAISE EXCEPTION 'Cash-release transactions must use the Treasurer release workflow';
  END IF;

  UPDATE public.transaction_workflows
  SET status = 'approved',
      accounting_status = 'not_processed',
      bookkeeper_id = NULL,
      processed_at = NULL,
      updated_at = now()
  WHERE id = p_workflow_id;

  RETURN public.process_transaction_workflow(p_workflow_id);
END;
$$;

REVOKE ALL ON FUNCTION public.retry_transaction_workflow_processing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_transaction_workflow_processing(UUID) TO authenticated;

COMMIT;

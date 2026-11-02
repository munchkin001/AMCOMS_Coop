-- Review and apply manually. Approval now converts the application workflow
-- into its loan-disbursement workflow instead of creating a duplicate row.

BEGIN;

ALTER TABLE public.transaction_workflows
  ADD COLUMN IF NOT EXISTS superseded_by UUID
  REFERENCES public.transaction_workflows(id);

CREATE OR REPLACE FUNCTION public.review_transaction_workflow(
  p_workflow_id UUID,
  p_decision TEXT,
  p_remarks TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
  v_workflow public.transaction_workflows%ROWTYPE;
  v_next_status TEXT;
  v_loan RECORD;
  v_loan_request_data JSONB;
  v_member_name TEXT;
  v_release_payload JSONB;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('manager') THEN
    RAISE EXCEPTION 'Only an active Manager can review transactions';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'returned_for_correction') THEN
    RAISE EXCEPTION 'Choose approve, reject, or return for correction';
  END IF;
  IF p_decision <> 'approved' AND COALESCE(trim(p_remarks), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject or return a transaction';
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;
  IF NOT FOUND OR v_workflow.status NOT IN ('pending_approval', 'returned_for_correction') THEN
    RAISE EXCEPTION 'This transaction is no longer awaiting Manager review';
  END IF;
  IF v_workflow.created_by = v_staff_id THEN
    RAISE EXCEPTION 'A requester cannot approve their own transaction';
  END IF;
  IF v_workflow.transaction_type = 'loan_application' AND p_decision = 'returned_for_correction' THEN
    RAISE EXCEPTION 'Loan applications must be corrected and resubmitted through the loan application flow';
  END IF;

  IF v_workflow.transaction_type = 'loan_application' THEN
    PERFORM public.review_loan_request(
      v_workflow.source_record_id,
      p_decision,
      COALESCE(NULLIF(trim(p_remarks), ''), 'Approved through Transaction Approvals')
    );
  END IF;

  v_next_status := CASE WHEN p_decision = 'returned_for_correction' THEN 'returned_for_correction' ELSE p_decision END;
  UPDATE public.transaction_workflows
  SET status = v_next_status,
      approved_payload = CASE WHEN p_decision = 'approved' THEN payload ELSE approved_payload END,
      manager_id = v_staff_id,
      manager_decision_at = now(),
      manager_remarks = NULLIF(trim(p_remarks), ''),
      updated_at = now()
  WHERE id = p_workflow_id;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id,
    actor_staff_id, remarks, snapshot
  ) VALUES (
    p_workflow_id, p_decision, v_workflow.status, v_next_status, v_auth_id,
    v_staff_id, NULLIF(trim(p_remarks), ''),
    jsonb_build_object('amount', v_workflow.amount, 'approved_payload', v_workflow.payload)
  );

  IF v_workflow.transaction_type = 'loan_application' AND p_decision = 'approved' THEN
    SELECT * INTO v_loan
    FROM public.loans
    WHERE request_id = v_workflow.source_record_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approved loan record was not created';
    END IF;

    SELECT request_data INTO v_loan_request_data
    FROM public.requests
    WHERE id = v_loan.request_id;
    SELECT trim(concat_ws(' ', first_name, middle_name, last_name))
    INTO v_member_name
    FROM public.members
    WHERE id = v_loan.member_id;
    IF COALESCE(v_member_name, '') = '' THEN
      RAISE EXCEPTION 'The member linked to this loan could not be found';
    END IF;

    v_release_payload := jsonb_build_object(
      'loan_id', v_loan.id,
      'request_id', v_loan.request_id,
      'loan_number', v_loan.loan_number,
      'principal_amount', v_loan.principal_amount,
      'term_months', v_loan.term_months,
      'payment_frequency', v_loan.payment_frequency,
      'installments', v_loan.installments,
      'installment_amount', v_loan.installment_amount,
      'total_interest', v_loan.total_interest,
      'total_amount', v_loan.total_amount,
      'notes', v_loan.notes,
      'request_data', COALESCE(v_loan_request_data, '{}'::JSONB),
      'release_date', NULL,
      'payment_source', 'cash-on-hand'
    );

    UPDATE public.transaction_workflows existing
    SET superseded_by = p_workflow_id,
        source_record_id = NULL,
        updated_at = now()
    WHERE existing.transaction_type = 'loan_disbursement'
      AND existing.source_module = 'loan_application'
      AND existing.source_record_id = v_loan.id
      AND existing.id <> p_workflow_id
      AND existing.superseded_by IS NULL;

    UPDATE public.transaction_workflows
    SET transaction_type = 'loan_disbursement',
        direction = 'cash_out',
        source_record_id = v_loan.id,
        member_id = v_loan.member_id,
        counterparty_name = v_member_name,
        amount = v_loan.principal_amount,
        payment_method = 'cash',
        description = 'Loan release ' || v_loan.loan_number,
        payload = v_release_payload,
        approved_payload = v_release_payload,
        cash_release_required = true,
        updated_at = now()
    WHERE id = p_workflow_id;
  END IF;

  RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', v_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_transaction_workflow(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_transaction_workflow(UUID, TEXT, TEXT) TO authenticated;

DO $$
DECLARE
  v_application RECORD;
  v_release public.transaction_workflows%ROWTYPE;
  v_has_release BOOLEAN;
  v_member_name TEXT;
  v_payload JSONB;
BEGIN
  FOR v_application IN
    SELECT
      application.id AS workflow_id,
      application.manager_id,
      application.manager_decision_at,
      application.manager_remarks,
      application.created_by,
      application.created_by_auth_id,
      request.id AS request_id,
      request.request_data,
      loan.id AS loan_id,
      loan.loan_number,
      loan.member_id,
      loan.principal_amount,
      loan.term_months,
      loan.payment_frequency,
      loan.installments,
      loan.installment_amount,
      loan.total_interest,
      loan.total_amount,
      loan.notes,
      member.first_name,
      member.middle_name,
      member.last_name
    FROM public.transaction_workflows application
    JOIN public.requests request
      ON request.id = application.source_record_id
     AND request.request_type = 'loan_application'
     AND request.status = 'approved'
    JOIN public.loans loan ON loan.request_id = request.id
    JOIN public.members member ON member.id = loan.member_id
    WHERE application.transaction_type = 'loan_application'
      AND application.status NOT IN ('pending_approval', 'returned_for_correction', 'rejected')
    FOR UPDATE OF application
  LOOP
    SELECT * INTO v_release
    FROM public.transaction_workflows release
    WHERE release.transaction_type = 'loan_disbursement'
      AND release.source_module = 'loan_application'
      AND release.source_record_id = v_application.loan_id
    FOR UPDATE;
    v_has_release := FOUND;
    v_member_name := trim(concat_ws(
      ' ', v_application.first_name, v_application.middle_name, v_application.last_name
    ));
    v_payload := jsonb_build_object(
      'loan_id', v_application.loan_id,
      'request_id', v_application.request_id,
      'loan_number', v_application.loan_number,
      'principal_amount', v_application.principal_amount,
      'term_months', v_application.term_months,
      'payment_frequency', v_application.payment_frequency,
      'installments', v_application.installments,
      'installment_amount', v_application.installment_amount,
      'total_interest', v_application.total_interest,
      'total_amount', v_application.total_amount,
      'notes', v_application.notes,
      'request_data', COALESCE(v_application.request_data, '{}'::JSONB),
      'release_date', NULL,
      'payment_source', 'cash-on-hand'
    );

    IF v_has_release THEN
      UPDATE public.transaction_workflows
      SET superseded_by = v_release.id,
          source_record_id = NULL,
          updated_at = now()
      WHERE id = v_application.workflow_id;

      UPDATE public.transaction_workflows
      SET transaction_type = 'loan_disbursement',
          direction = 'cash_out',
          member_id = v_application.member_id,
          counterparty_name = v_member_name,
          amount = v_application.principal_amount,
          payment_method = 'cash',
          description = 'Loan release ' || v_application.loan_number,
          payload = v_payload,
          approved_payload = v_payload,
          cash_release_required = true,
          manager_id = COALESCE(v_application.manager_id, manager_id),
          manager_decision_at = COALESCE(v_application.manager_decision_at, manager_decision_at),
          manager_remarks = COALESCE(v_application.manager_remarks, manager_remarks),
          created_by = v_application.created_by,
          created_by_auth_id = v_application.created_by_auth_id,
          updated_at = now()
      WHERE id = v_release.id;
    ELSE
      UPDATE public.transaction_workflows
      SET transaction_type = 'loan_disbursement',
          direction = 'cash_out',
          source_record_id = v_application.loan_id,
          member_id = v_application.member_id,
          counterparty_name = v_member_name,
          amount = v_application.principal_amount,
          payment_method = 'cash',
          description = 'Loan release ' || v_application.loan_number,
          payload = v_payload,
          approved_payload = v_payload,
          cash_release_required = true,
          updated_at = now()
      WHERE id = v_application.workflow_id;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

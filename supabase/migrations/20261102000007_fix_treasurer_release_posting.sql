-- REVIEW AND APPLY MANUALLY.
-- Carry the authenticated release workflow into internal posting functions.
-- This does not grant Treasurers access to enter standalone disbursements.

BEGIN;

CREATE OR REPLACE FUNCTION public.workflow_disbursement_authorized(p_disbursement JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_workflow_id UUID := COALESCE(
    NULLIF(p_disbursement->>'workflow_id', '')::UUID,
    NULLIF(current_setting('amcoms.workflow_release_id', true), '')::UUID
  );
  v_workflow public.transaction_workflows%ROWTYPE;
BEGIN
  IF NOT public.has_role('treasurer') OR v_workflow_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = v_workflow_id;
  IF NOT FOUND
     OR v_workflow.status <> 'awaiting_release'
     OR NOT v_workflow.cash_release_required
     OR v_workflow.direction <> 'cash_out'
     OR v_workflow.transaction_type NOT IN (
       'loan_disbursement', 'savings_withdrawal', 'time_deposit_withdrawal',
       'operating_expense', 'other_disbursement'
     )
     OR v_workflow.manager_id IS NULL
     OR v_workflow.manager_decision_at IS NULL
     OR v_workflow.bookkeeper_id IS NULL
     OR v_workflow.processed_at IS NULL
     OR v_workflow.amount <> NULLIF(p_disbursement->>'amount', '')::NUMERIC
     OR (
       v_workflow.member_id IS NOT NULL
       AND v_workflow.member_id IS DISTINCT FROM NULLIF(p_disbursement->>'member_id', '')::UUID
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.transaction_workflow_documents
       WHERE workflow_id = v_workflow.id
         AND document_type = 'cash_release_acknowledgment'
     ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.workflow_disbursement_authorized(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workflow_member_entry_authorized(
  p_entry JSONB,
  p_disbursement JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_workflow_id UUID := COALESCE(
    NULLIF(COALESCE(p_disbursement->>'workflow_id', p_entry->>'workflow_id'), '')::UUID,
    NULLIF(current_setting('amcoms.workflow_release_id', true), '')::UUID
  );
  v_workflow public.transaction_workflows%ROWTYPE;
  v_entry_type TEXT := p_entry->>'entry_type';
  v_member_id UUID := NULLIF(COALESCE(p_disbursement->>'member_id', p_entry->>'member_id'), '')::UUID;
  v_amount NUMERIC := NULLIF(COALESCE(p_disbursement->>'amount', p_entry->>'amount'), '')::NUMERIC;
BEGIN
  IF NOT public.has_role('treasurer')
     OR v_workflow_id IS NULL
     OR v_entry_type NOT IN ('savings_withdrawal', 'time_deposit_withdrawal') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = v_workflow_id;
  IF NOT FOUND
     OR v_workflow.status <> 'awaiting_release'
     OR NOT v_workflow.cash_release_required
     OR v_workflow.direction <> 'cash_out'
     OR v_workflow.transaction_type <> v_entry_type
     OR v_workflow.manager_id IS NULL
     OR v_workflow.manager_decision_at IS NULL
     OR v_workflow.bookkeeper_id IS NULL
     OR v_workflow.processed_at IS NULL
     OR v_workflow.member_id IS DISTINCT FROM v_member_id
     OR v_workflow.amount <> v_amount
     OR NOT EXISTS (
       SELECT 1
       FROM public.transaction_workflow_documents
       WHERE workflow_id = v_workflow.id
         AND document_type = 'cash_release_acknowledgment'
     ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.workflow_member_entry_authorized(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workflow_loan_release_authorized(p_loan_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.has_role('treasurer') AND EXISTS (
    SELECT 1
    FROM public.transaction_workflows workflow
    JOIN public.transaction_workflow_documents document
      ON document.workflow_id = workflow.id
     AND document.document_type = 'cash_release_acknowledgment'
    JOIN public.loans loan
      ON loan.id = p_loan_id
     AND loan.id = workflow.source_record_id
     AND NULLIF(workflow.approved_payload->>'loan_id', '')::UUID = loan.id
     AND loan.status = 'approved'
    JOIN public.requests request
      ON request.id = loan.request_id
     AND request.request_type = 'loan_application'
     AND request.status = 'approved'
    WHERE workflow.id = NULLIF(current_setting('amcoms.workflow_release_id', true), '')::UUID
      AND workflow.transaction_type = 'loan_disbursement'
      AND workflow.source_module = 'loan_application'
      AND workflow.status = 'awaiting_release'
      AND workflow.cash_release_required
      AND workflow.direction = 'cash_out'
      AND workflow.manager_id IS NOT NULL
      AND workflow.manager_decision_at IS NOT NULL
      AND workflow.bookkeeper_id IS NOT NULL
      AND workflow.processed_at IS NOT NULL
      AND workflow.member_id = loan.member_id
      AND workflow.amount = loan.principal_amount
  );
$$;
REVOKE ALL ON FUNCTION public.workflow_loan_release_authorized(UUID) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_signature REGPROCEDURE := 'public.confirm_transaction_workflow_release(uuid,uuid,text)'::REGPROCEDURE;
  v_definition TEXT;
  v_guard TEXT := $guard$  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can confirm cash release';
  END IF;
$guard$;
  v_guard_with_context TEXT := v_guard
    || '  PERFORM set_config(''amcoms.workflow_release_id'', p_workflow_id::TEXT, true);'
    || E'\n';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('PERFORM set_config(''amcoms.workflow_release_id''' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely add Treasurer release context to confirm_transaction_workflow_release';
  END IF;
  EXECUTE replace(v_definition, v_guard, v_guard_with_context);
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
  v_signatures TEXT[] := ARRAY[
    'public.save_cash_disbursement_core(jsonb,jsonb)',
    'public.save_cash_disbursement_before_auto_voucher_number(jsonb,jsonb)',
    'public.save_cash_disbursement(jsonb,jsonb)',
    'public.record_member_financial_entry_before_auto_receipt(jsonb,jsonb,jsonb)',
    'public.record_loan_disbursement(uuid,text,date,text)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    SELECT pg_get_functiondef(v_signature::REGPROCEDURE) INTO v_definition;
    v_old := 'IF NOT public.has_role(''bookkeeper'') THEN';
    IF v_signature = 'public.record_member_financial_entry_before_auto_receipt(jsonb,jsonb,jsonb)' THEN
      v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_member_entry_authorized(p_entry, p_disbursement) THEN';
    ELSIF v_signature = 'public.record_loan_disbursement(uuid,text,date,text)' THEN
      v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_loan_release_authorized(p_loan_id) THEN';
    ELSE
      v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_disbursement_authorized(p_disbursement) THEN';
    END IF;

    IF position(v_old IN v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old, v_new);
    ELSIF position(v_new IN v_definition) = 0 THEN
      v_old := 'IF v_staff_id IS NULL OR NOT public.has_role(''bookkeeper'') THEN';
      v_new := replace(v_new, 'IF NOT public.has_role(''bookkeeper'')', 'IF v_staff_id IS NULL OR NOT public.has_role(''bookkeeper'')');
      IF v_signature = 'public.record_member_financial_entry_before_auto_receipt(jsonb,jsonb,jsonb)' THEN
        v_new := 'IF v_staff_id IS NULL OR (NOT public.has_role(''bookkeeper'') AND NOT public.workflow_member_entry_authorized(p_entry, p_disbursement)) THEN';
      ELSIF v_signature = 'public.record_loan_disbursement(uuid,text,date,text)' THEN
        v_new := 'IF v_staff_id IS NULL OR (NOT public.has_role(''bookkeeper'') AND NOT public.workflow_loan_release_authorized(p_loan_id)) THEN';
      ELSE
        v_new := 'IF v_staff_id IS NULL OR (NOT public.has_role(''bookkeeper'') AND NOT public.workflow_disbursement_authorized(p_disbursement)) THEN';
      END IF;

      IF position(v_old IN v_definition) > 0 THEN
        v_definition := replace(v_definition, v_old, v_new);
      ELSIF position(v_new IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Could not safely authorize approved Treasurer release in %', v_signature;
      END IF;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$$;

COMMIT;

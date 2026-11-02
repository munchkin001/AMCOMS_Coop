-- Review and apply manually. A loan release is complete only after the
-- cash-disbursement row and posted journal entry have both been verified.

BEGIN;

DO $$
DECLARE
  v_workflow RECORD;
BEGIN
  FOR v_workflow IN
    SELECT workflow.id, workflow.source_record_id, workflow.payload
    FROM public.transaction_workflows workflow
    JOIN public.loans loan
      ON loan.id = NULLIF(workflow.payload->>'loan_id', '')::UUID
    WHERE workflow.transaction_type = 'loan_disbursement'
      AND workflow.cash_release_required
      AND workflow.status = 'completed'
      AND workflow.cash_release_status = 'released'
      AND loan.status = 'approved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.cash_disbursements disbursement
        WHERE disbursement.loan_id = loan.id
      )
    FOR UPDATE OF workflow
  LOOP
    UPDATE public.transaction_workflows
    SET status = 'awaiting_release',
        cash_release_status = 'awaiting_release',
        accounting_status = 'processing',
        business_record_table = NULL,
        business_record_id = NULL,
        journal_entry_id = NULL,
        treasurer_id = NULL,
        released_at = NULL,
        release_remarks = NULL,
        updated_at = now()
    WHERE id = v_workflow.id;

    IF auth.uid() IS NOT NULL THEN
      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, previous_status, next_status, actor_auth_id,
        actor_staff_id, remarks
      ) VALUES (
        v_workflow.id, 'release_issue_reported', 'completed', 'awaiting_release',
        auth.uid(), public.current_staff_id(),
        'Release confirmation was restored because no cash disbursement was recorded.'
      );
    END IF;
  END LOOP;
END;
$$;

-- Reconcile a loan that was actually disbursed while its workflow remained
-- awaiting release. Trust only a recorded disbursement with a posted journal.
UPDATE public.transaction_workflows workflow
SET status = 'completed',
    cash_release_status = 'released',
    accounting_status = 'posted',
    business_record_table = 'cash_disbursements',
    business_record_id = disbursement.id,
    journal_entry_id = disbursement.journal_entry_id,
    treasurer_id = COALESCE(workflow.treasurer_id, disbursement.created_by),
    released_at = COALESCE(workflow.released_at, disbursement.updated_at, disbursement.created_at),
    updated_at = now()
FROM public.loans loan
JOIN public.cash_disbursements disbursement ON disbursement.loan_id = loan.id
JOIN public.journal_entries journal ON journal.id = disbursement.journal_entry_id
WHERE workflow.transaction_type = 'loan_disbursement'
  AND workflow.cash_release_required
  AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
  AND loan.id = NULLIF(workflow.approved_payload->>'loan_id', '')::UUID
  AND loan.status = 'active'
  AND loan.release_date IS NOT NULL
  AND disbursement.status = 'recorded'
  AND journal.status = 'posted';

CREATE OR REPLACE FUNCTION public.confirm_transaction_workflow_release(
  p_workflow_id UUID,
  p_document_id UUID,
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
  v_payload JSONB;
  v_result JSONB;
  v_journal_id UUID;
  v_business_id UUID;
  v_business_table TEXT;
  v_loan_id UUID;
  v_posted_disbursement_id UUID;
  v_loan_status TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can confirm cash release';
  END IF;
  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;
  IF NOT FOUND OR v_workflow.status NOT IN ('awaiting_release', 'on_hold', 'release_issue')
     OR NOT v_workflow.cash_release_required THEN
    RAISE EXCEPTION 'This transaction is not eligible for cash release';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.transaction_workflow_documents
    WHERE id = p_document_id
      AND workflow_id = p_workflow_id
      AND document_type = 'cash_release_acknowledgment'
  ) THEN
    RAISE EXCEPTION 'Attach verified proof of release before confirming';
  END IF;

  v_payload := v_workflow.approved_payload;
  IF v_workflow.transaction_type = 'loan_disbursement' THEN
    v_loan_id := NULLIF(v_payload->>'loan_id', '')::UUID;
    IF v_loan_id IS NULL THEN
      RAISE EXCEPTION 'The approved loan is missing from this release workflow';
    END IF;
    SELECT status INTO v_loan_status
    FROM public.loans
    WHERE id = v_loan_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The approved loan could not be found';
    END IF;

    SELECT disbursement.id, disbursement.journal_entry_id
    INTO v_business_id, v_journal_id
    FROM public.cash_disbursements disbursement
    JOIN public.journal_entries journal
      ON journal.id = disbursement.journal_entry_id
    WHERE disbursement.loan_id = v_loan_id
      AND disbursement.status = 'recorded'
      AND journal.status = 'posted'
    FOR UPDATE OF disbursement;

    IF FOUND THEN
      IF v_loan_status <> 'active' THEN
        RAISE EXCEPTION 'A recorded disbursement exists, but the loan is not active. Ask an administrator to reconcile this loan.';
      END IF;
      v_posted_disbursement_id := v_business_id;
      v_business_table := 'cash_disbursements';
      v_result := jsonb_build_object(
        'disbursement_id', v_business_id,
        'journal_entry_id', v_journal_id,
        'status', 'recorded',
        'loan_id', v_loan_id,
        'loan_number', v_payload->>'loan_number',
        'release_date', (SELECT release_date FROM public.loans WHERE id = v_loan_id)
      );
    ELSE
      IF v_loan_status = 'active' THEN
        RAISE EXCEPTION 'This loan is already active, but no recorded cash disbursement was found. Ask an administrator to reconcile it; do not attempt another release.';
      END IF;
      v_result := public.record_loan_disbursement(
        v_loan_id,
        p_workflow_id::TEXT,
        COALESCE(NULLIF(v_payload->>'release_date', '')::DATE, CURRENT_DATE),
        COALESCE(NULLIF(v_payload->>'payment_source', ''), 'cash-on-hand')
      );
      v_business_table := 'cash_disbursements';
      v_business_id := NULLIF(v_result->>'disbursement_id', '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;

      SELECT disbursement.id
      INTO v_posted_disbursement_id
      FROM public.cash_disbursements disbursement
      JOIN public.journal_entries journal
        ON journal.id = disbursement.journal_entry_id
      WHERE disbursement.id = v_business_id
        AND disbursement.loan_id = v_loan_id
        AND disbursement.status = 'recorded'
        AND disbursement.journal_entry_id = v_journal_id
        AND journal.status = 'posted';
      IF v_posted_disbursement_id IS NULL THEN
        RAISE EXCEPTION 'Loan release did not create a recorded cash disbursement and posted journal entry';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.loans
        WHERE id = v_loan_id AND status = 'active' AND release_date IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Loan release did not activate the approved loan';
      END IF;
    END IF;
  ELSIF v_workflow.transaction_type IN ('savings_withdrawal', 'time_deposit_withdrawal') THEN
    v_payload := jsonb_set(
      v_payload,
      '{p_disbursement,workflow_id}',
      to_jsonb(p_workflow_id::TEXT),
      true
    );
    v_payload := jsonb_set(
      v_payload,
      '{p_entry,workflow_id}',
      to_jsonb(p_workflow_id::TEXT),
      true
    );
    v_result := public.record_member_financial_entry(
      NULL,
      v_payload->'p_disbursement',
      v_payload->'p_entry'
    );
    v_business_table := 'cash_disbursements';
    v_business_id := NULLIF(v_result->>'disbursement_id', '')::UUID;
    v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
  ELSIF v_workflow.transaction_type IN ('operating_expense', 'other_disbursement') THEN
    v_payload := jsonb_set(
      v_payload,
      '{p_disbursement,workflow_id}',
      to_jsonb(p_workflow_id::TEXT),
      true
    );
    v_result := public.save_cash_disbursement(
      v_payload->'p_disbursement',
      v_payload->'p_allocations'
    );
    v_business_table := 'cash_disbursements';
    v_business_id := NULLIF(v_result->>'disbursement_id', '')::UUID;
    v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
  ELSE
    RAISE EXCEPTION 'This cash-out transaction type has no approved release processor';
  END IF;

  IF v_business_id IS NULL OR v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Cash release did not return a posted business record and journal entry';
  END IF;
  IF v_business_table = 'cash_disbursements' AND NOT EXISTS (
    SELECT 1
    FROM public.cash_disbursements disbursement
    JOIN public.journal_entries journal
      ON journal.id = disbursement.journal_entry_id
    WHERE disbursement.id = v_business_id
      AND disbursement.status = 'recorded'
      AND disbursement.journal_entry_id = v_journal_id
      AND journal.status = 'posted'
  ) THEN
    RAISE EXCEPTION 'Cash release was not recorded with a posted journal entry';
  END IF;

  UPDATE public.transaction_workflows
  SET status = 'completed',
      cash_release_status = 'released',
      accounting_status = 'posted',
      treasurer_id = v_staff_id,
      released_at = clock_timestamp(),
      release_remarks = NULLIF(trim(p_remarks), ''),
      business_record_table = v_business_table,
      business_record_id = v_business_id,
      journal_entry_id = v_journal_id,
      updated_at = now()
  WHERE id = p_workflow_id;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id,
    actor_staff_id, remarks, snapshot
  ) VALUES (
    p_workflow_id, 'release_confirmed', v_workflow.status, 'completed',
    v_auth_id, v_staff_id, NULLIF(trim(p_remarks), ''),
    jsonb_build_object(
      'amount', v_workflow.amount,
      'counterparty_name', v_workflow.counterparty_name,
      'document_id', p_document_id,
      'business_record_id', v_business_id,
      'journal_entry_id', v_journal_id,
      'result', v_result
    )
  );
  RETURN jsonb_build_object(
    'workflow_id', p_workflow_id,
    'status', 'completed',
    'business_record_id', v_business_id,
    'journal_entry_id', v_journal_id,
    'result', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_transaction_workflow_release(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transaction_workflow_release(UUID, UUID, TEXT) TO authenticated;

COMMIT;

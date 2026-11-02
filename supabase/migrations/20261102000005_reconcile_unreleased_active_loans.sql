-- Review and apply manually. Restore an active loan to approved only when
-- there is no cash disbursement, loan payment, or paid schedule evidence.

BEGIN;

DO $$
DECLARE
  v_workflow RECORD;
BEGIN
  FOR v_workflow IN
    SELECT workflow.id AS workflow_id,
           workflow.status AS workflow_status,
           loan.id AS loan_id
    FROM public.transaction_workflows workflow
    JOIN public.loans loan ON loan.id = workflow.source_record_id
    JOIN public.requests request
      ON request.id = loan.request_id
     AND request.request_type = 'loan_application'
     AND request.status = 'approved'
    WHERE workflow.transaction_type = 'loan_disbursement'
      AND workflow.cash_release_required
      AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue', 'completed')
      AND loan.status = 'active'
      AND loan.balance = loan.principal_amount
      AND COALESCE(loan.penalty_total, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.cash_disbursements disbursement
        WHERE disbursement.loan_id = loan.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.loan_payments payment
        WHERE payment.loan_id = loan.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.loan_schedule schedule
        WHERE schedule.loan_id = loan.id
          AND (
            schedule.amount_paid <> 0
            OR schedule.penalty_amount <> 0
            OR schedule.status = 'paid'
          )
      )
    FOR UPDATE OF workflow, loan
  LOOP
    DELETE FROM public.loan_schedule
    WHERE loan_id = v_workflow.loan_id;

    UPDATE public.loans
    SET status = 'approved',
        balance = principal_amount,
        release_date = NULL,
        maturity_date = NULL,
        updated_at = now()
    WHERE id = v_workflow.loan_id;

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
    WHERE id = v_workflow.workflow_id;

    IF auth.uid() IS NOT NULL THEN
      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, previous_status, next_status, actor_auth_id,
        actor_staff_id, remarks
      ) VALUES (
        v_workflow.workflow_id, 'release_issue_reported', v_workflow.workflow_status,
        'awaiting_release', auth.uid(), public.current_staff_id(),
        'Loan activation was reversed because no cash disbursement or repayment was recorded.'
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;

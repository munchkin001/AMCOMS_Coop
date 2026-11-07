BEGIN;

DROP FUNCTION IF EXISTS public.workflow_member_release_authorized();

CREATE OR REPLACE FUNCTION public.workflow_member_release_authorized()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.has_role('treasurer') AND EXISTS (
    SELECT 1
    FROM public.transaction_workflows workflow
    WHERE workflow.id = NULLIF(current_setting('amcoms.workflow_release_id', true), '')::UUID
      AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
      AND workflow.cash_release_required
      AND workflow.direction = 'cash_out'
      AND workflow.transaction_type IN (
        'loan_disbursement',
        'savings_withdrawal',
        'time_deposit_withdrawal'
      )
      AND workflow.manager_id IS NOT NULL
      AND workflow.manager_decision_at IS NOT NULL
      AND workflow.bookkeeper_id IS NOT NULL
      AND workflow.processed_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.transaction_workflow_documents document
        WHERE document.workflow_id = workflow.id
          AND document.document_type = 'cash_release_acknowledgment'
      )
  );
$$;

REVOKE ALL
  ON FUNCTION public.workflow_member_release_authorized()
  FROM PUBLIC, anon, authenticated;

COMMIT;

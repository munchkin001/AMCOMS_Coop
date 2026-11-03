BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_transaction_workflow(p_workflow_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.transaction_workflows workflow
    WHERE workflow.id = p_workflow_id
      AND (
        public.has_role('manager')
        OR workflow.created_by_auth_id = auth.uid()
        OR (
          public.has_role('bookkeeper')
          AND (
            workflow.created_by_auth_id = auth.uid()
            OR workflow.status IN (
              'approved', 'processing', 'awaiting_release', 'on_hold',
              'release_issue', 'released', 'completed', 'accounting_error'
            )
          )
        )
        OR (
          public.has_role('treasurer')
          AND (
            (
              workflow.cash_release_required
              AND workflow.status IN (
                'approved', 'awaiting_release', 'on_hold',
                'release_issue', 'released', 'completed'
              )
              AND (
                workflow.status <> 'approved'
                OR workflow.transaction_type = 'loan_disbursement'
              )
            )
            OR (workflow.direction = 'cash_in' AND workflow.status = 'completed')
          )
        )
        OR workflow.member_id = public.get_member_id()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_transaction_workflow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_transaction_workflow(UUID) TO authenticated;

COMMIT;

-- REVIEW AND APPLY MANUALLY.
-- Scope member-disbursement posting permission to the current approved release.

BEGIN;

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
        'loan_disbursement', 'savings_withdrawal', 'time_deposit_withdrawal'
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
REVOKE ALL ON FUNCTION public.workflow_member_release_authorized() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_function RECORD;
  v_definition TEXT;
  v_old_guard TEXT;
  v_new_guard TEXT;
  v_patched BOOLEAN;
  v_match_count INTEGER := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid::REGPROCEDURE AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc ILIKE '%bookkeepers can record member disbursements%'
  LOOP
    v_match_count := v_match_count + 1;
    SELECT pg_get_functiondef(v_function.signature) INTO v_definition;
    v_patched := false;

    v_old_guard := 'IF NOT public.has_role(''bookkeeper'') THEN';
    v_new_guard := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_member_release_authorized() THEN';
    IF position(v_old_guard IN v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old_guard, v_new_guard);
      v_patched := true;
    END IF;

    v_old_guard := 'IF v_staff_id IS NULL OR NOT public.has_role(''bookkeeper'') THEN';
    v_new_guard := 'IF v_staff_id IS NULL OR (NOT public.has_role(''bookkeeper'') AND NOT public.workflow_member_release_authorized()) THEN';
    IF position(v_old_guard IN v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old_guard, v_new_guard);
      v_patched := true;
    END IF;

    IF NOT v_patched
       AND position('public.workflow_member_release_authorized()' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Found the member-disbursement permission error in %, but could not safely update its Bookkeeper role guard', v_function.signature;
    END IF;

    EXECUTE v_definition;
  END LOOP;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION 'Could not find a public function containing the reported member-disbursement permission error. Inspect the active database function before retrying.';
  END IF;
END;
$$;

COMMIT;

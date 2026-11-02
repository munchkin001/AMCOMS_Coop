CREATE OR REPLACE FUNCTION public.mark_bookkeeper_cash_in_submitted_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_type = 'submitted' AND EXISTS (
    SELECT 1
    FROM public.transaction_workflows AS workflow
    JOIN public.staff AS creator ON creator.id = workflow.created_by
    WHERE workflow.id = NEW.workflow_id
      AND workflow.direction = 'cash_in'
      AND workflow.status = 'approved'
      AND creator.role = 'bookkeeper'
      AND creator.is_active
  ) THEN
    NEW.next_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_bookkeeper_cash_in_submitted_event
  ON public.transaction_workflow_events;
CREATE TRIGGER mark_bookkeeper_cash_in_submitted_event
  BEFORE INSERT ON public.transaction_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.mark_bookkeeper_cash_in_submitted_event();

CREATE OR REPLACE FUNCTION public.process_bookkeeper_cash_in_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NEW.event_type = 'submitted' THEN
    PERFORM 1
    FROM public.transaction_workflows AS workflow
    JOIN public.staff AS creator ON creator.id = workflow.created_by
    WHERE workflow.id = NEW.workflow_id
      AND workflow.direction = 'cash_in'
      AND workflow.status = 'approved'
      AND creator.role = 'bookkeeper'
      AND creator.is_active;

    IF FOUND THEN
      v_result := public.process_transaction_workflow(NEW.workflow_id);
      IF v_result->>'status' IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'Incoming transaction could not be recorded automatically: %',
          COALESCE(v_result->>'error', v_result->>'status', 'unknown processing result');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS process_bookkeeper_cash_in_workflow
  ON public.transaction_workflow_events;
CREATE TRIGGER process_bookkeeper_cash_in_workflow
  AFTER INSERT ON public.transaction_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.process_bookkeeper_cash_in_workflow();

DO $$
DECLARE
  v_workflow RECORD;
  v_result JSONB;
BEGIN
  FOR v_workflow IN
    SELECT workflow.id, workflow.created_by_auth_id, workflow.created_by
    FROM public.transaction_workflows AS workflow
    JOIN public.staff AS creator ON creator.id = workflow.created_by
    WHERE workflow.direction = 'cash_in'
      AND workflow.status = 'pending_approval'
      AND workflow.accounting_status = 'not_processed'
      AND workflow.business_record_id IS NULL
      AND creator.role = 'bookkeeper'
      AND creator.is_active
    ORDER BY workflow.created_at
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_workflow.created_by_auth_id::TEXT, true);

    UPDATE public.transaction_workflows
    SET approved_payload = payload,
        status = 'approved',
        updated_at = now()
    WHERE id = v_workflow.id
      AND status = 'pending_approval';

    IF FOUND THEN
      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, previous_status, next_status,
        actor_auth_id, actor_staff_id, remarks
      ) VALUES (
        v_workflow.id, 'approved', 'pending_approval', 'approved',
        v_workflow.created_by_auth_id, v_workflow.created_by,
        'Cash-in does not require Manager approval; automatically recorded.'
      );

      v_result := public.process_transaction_workflow(v_workflow.id);
      IF v_result->>'status' IS DISTINCT FROM 'completed' THEN
        RAISE WARNING 'Cash-in workflow % could not be recorded automatically: %',
          v_workflow.id, COALESCE(v_result->>'error', v_result->>'status', 'unknown processing result');
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_bookkeeper_cash_in_submitted_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_bookkeeper_cash_in_workflow() FROM PUBLIC, anon, authenticated;

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

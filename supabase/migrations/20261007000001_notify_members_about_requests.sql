CREATE OR REPLACE FUNCTION public.notify_member_request_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recipient RECORD;
  request_label TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type TEXT;
  notification_priority TEXT := 'normal';
BEGIN
  request_label := COALESCE(
    NULLIF(NEW.request_data->>'type', ''),
    INITCAP(REPLACE(NEW.request_type, '_', ' '))
  );

  IF TG_OP = 'INSERT' THEN
    notification_title := 'Request received';
    notification_message := format('Your %s request was submitted and is pending review.', request_label);
    notification_type := 'info';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    notification_title := CASE NEW.status
      WHEN 'approved' THEN 'Request approved'
      WHEN 'rejected' THEN 'Request declined'
      ELSE 'Request status updated'
    END;
    notification_message := format('Your %s request is now %s.%s', request_label, REPLACE(NEW.status, '_', ' '),
      CASE WHEN NEW.review_notes IS NOT NULL AND NEW.review_notes <> '' THEN format(' Note: %s', NEW.review_notes) ELSE '' END);
    notification_type := 'approval';
    notification_priority := CASE WHEN NEW.status = 'rejected' THEN 'high' ELSE 'normal' END;
  ELSE
    RETURN NEW;
  END IF;

  FOR recipient IN
    SELECT id
    FROM public.staff
    WHERE member_id = NEW.member_id
      AND role = 'member'
      AND is_active = true
  LOOP
    PERFORM public.create_notification(
      recipient.id,
      notification_type,
      notification_title,
      notification_message,
      'requests',
      NEW.id,
      notification_priority
    );
  END LOOP;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_member_request_changes ON public.requests;
CREATE TRIGGER notify_member_request_changes
  AFTER INSERT OR UPDATE OF status ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_member_request_changes();

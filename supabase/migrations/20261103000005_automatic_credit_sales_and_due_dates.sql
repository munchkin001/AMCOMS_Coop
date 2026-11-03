BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS due_date DATE;

UPDATE public.sales_orders
SET due_date = order_date
WHERE payment_status IN ('pending', 'partial')
  AND due_date IS NULL;

CREATE OR REPLACE FUNCTION public.record_cooperative_sale_with_contact(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_contact_number TEXT := NULLIF(trim(COALESCE(p_sale->>'customer_contact_number', '')), '');
  v_member_id UUID := NULLIF(p_sale->>'member_id', '')::UUID;
  v_payment_type TEXT := p_sale->>'payment_type';
  v_sale_date DATE := NULLIF(p_sale->>'transaction_date', '')::DATE;
  v_due_date DATE := NULLIF(p_sale->>'due_date', '')::DATE;
  v_order_id UUID;
BEGIN
  IF v_contact_number IS NOT NULL AND length(v_contact_number) > 24 THEN
    RAISE EXCEPTION 'Customer contact number must be 24 characters or fewer';
  END IF;
  IF v_payment_type = 'credit'
     AND (v_due_date IS NULL OR v_sale_date IS NULL OR v_due_date < v_sale_date) THEN
    RAISE EXCEPTION 'Enter a credit-sale due date on or after the sale date';
  END IF;

  v_result := public.record_cooperative_sale(p_sale);
  v_order_id := NULLIF(v_result->>'sales_order_id', '')::UUID;
  IF v_order_id IS NOT NULL THEN
    UPDATE public.sales_orders
    SET customer_contact_number = CASE
          WHEN v_member_id IS NULL THEN v_contact_number
          ELSE customer_contact_number
        END,
        due_date = CASE WHEN v_payment_type = 'credit' THEN v_due_date ELSE NULL END
    WHERE id = v_order_id;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cooperative_sale_with_contact(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_bookkeeper_cash_in_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auto_recorded BOOLEAN;
BEGIN
  SELECT creator.role = 'bookkeeper' AND creator.is_active
  INTO v_auto_recorded
  FROM public.staff AS creator
  WHERE creator.id = NEW.created_by;

  IF COALESCE(v_auto_recorded, false)
     AND (
       NEW.direction = 'cash_in'
       OR (
         NEW.transaction_type = 'sale'
         AND NEW.payload #>> '{p_sale,payment_type}' = 'credit'
       )
     ) THEN
    NEW.approved_payload := NEW.payload;
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

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
      AND workflow.status = 'approved'
      AND creator.role = 'bookkeeper'
      AND creator.is_active
      AND (
        workflow.direction = 'cash_in'
        OR (
          workflow.transaction_type = 'sale'
          AND workflow.payload #>> '{p_sale,payment_type}' = 'credit'
        )
      )
  ) THEN
    NEW.next_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

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
      AND workflow.status = 'approved'
      AND creator.role = 'bookkeeper'
      AND creator.is_active
      AND (
        workflow.direction = 'cash_in'
        OR (
          workflow.transaction_type = 'sale'
          AND workflow.payload #>> '{p_sale,payment_type}' = 'credit'
        )
      );

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

UPDATE public.transaction_workflows AS workflow
SET payload = jsonb_set(
      workflow.payload,
      '{p_sale,due_date}',
      to_jsonb(COALESCE(
        NULLIF(workflow.payload #>> '{p_sale,due_date}', ''),
        NULLIF(workflow.payload #>> '{p_sale,transaction_date}', ''),
        (now() AT TIME ZONE 'Asia/Manila')::DATE::TEXT
      )),
      true
    ),
    approved_payload = CASE
      WHEN workflow.approved_payload IS NULL THEN NULL
      ELSE jsonb_set(
        workflow.approved_payload,
        '{p_sale,due_date}',
        to_jsonb(COALESCE(
          NULLIF(workflow.approved_payload #>> '{p_sale,due_date}', ''),
          NULLIF(workflow.approved_payload #>> '{p_sale,transaction_date}', ''),
          (now() AT TIME ZONE 'Asia/Manila')::DATE::TEXT
        )),
        true
      )
    END,
    updated_at = now()
FROM public.staff AS creator
WHERE creator.id = workflow.created_by
  AND creator.role = 'bookkeeper'
  AND workflow.transaction_type = 'sale'
  AND workflow.payload #>> '{p_sale,payment_type}' = 'credit'
  AND workflow.status IN ('pending_approval', 'approved')
  AND COALESCE(workflow.payload #>> '{p_sale,due_date}', '') = '';

DO $$
DECLARE
  v_workflow RECORD;
  v_result JSONB;
BEGIN
  FOR v_workflow IN
    SELECT workflow.id, workflow.created_by_auth_id, workflow.created_by,
           workflow.payload, workflow.status
    FROM public.transaction_workflows AS workflow
    JOIN public.staff AS staff ON staff.id = workflow.created_by
    WHERE workflow.transaction_type = 'sale'
      AND workflow.payload #>> '{p_sale,payment_type}' = 'credit'
      AND workflow.status IN ('pending_approval', 'approved')
      AND workflow.accounting_status = 'not_processed'
      AND workflow.business_record_id IS NULL
      AND staff.role = 'bookkeeper'
      AND staff.is_active
    ORDER BY workflow.created_at
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_workflow.created_by_auth_id::TEXT, true);

    IF v_workflow.status = 'pending_approval' THEN
      UPDATE public.transaction_workflows
      SET approved_payload = payload,
          status = 'approved',
          updated_at = now()
      WHERE id = v_workflow.id
        AND status = 'pending_approval';

      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, previous_status, next_status,
        actor_auth_id, actor_staff_id, remarks, snapshot
      ) VALUES (
        v_workflow.id, 'approved', 'pending_approval', 'approved',
        v_workflow.created_by_auth_id, v_workflow.created_by,
        'Credit sale recorded automatically; Manager approval is not required.',
        jsonb_build_object('payload', v_workflow.payload)
      );
    ELSE
      UPDATE public.transaction_workflows
      SET approved_payload = COALESCE(approved_payload, payload),
          updated_at = now()
      WHERE id = v_workflow.id
        AND status = 'approved';
    END IF;

    v_result := public.process_transaction_workflow(v_workflow.id);
    IF v_result->>'status' IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'Credit-sale workflow % could not be recorded automatically: %',
        v_workflow.id, COALESCE(v_result->>'error', v_result->>'status', 'unknown processing result');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_bookkeeper_cash_in_workflow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_bookkeeper_cash_in_submitted_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_bookkeeper_cash_in_workflow() FROM PUBLIC, anon, authenticated;

COMMIT;

-- REVIEW ONLY: state transitions and reuse of existing business posting RPCs.
-- Do not apply until validated against a test Supabase project.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_transaction_workflow(
  p_submission_key UUID,
  p_transaction_type TEXT,
  p_direction TEXT,
  p_source_module TEXT,
  p_source_record_id UUID,
  p_member_id UUID,
  p_counterparty_name TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_description TEXT,
  p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_id UUID := auth.uid();
  v_staff_id UUID := public.current_staff_id();
  v_workflow_id UUID;
  v_hash TEXT;
  v_cash_out BOOLEAN;
  v_direction TEXT := p_direction;
  v_existing_hash TEXT;
  v_actor_role TEXT := public.current_user_role();
  v_payload_amount NUMERIC;
  v_payload_member_id UUID;
  v_item JSONB;
  v_item_quantity NUMERIC;
  v_item_cost NUMERIC;
  v_item_count INTEGER := 0;
BEGIN
  IF v_auth_id IS NULL OR v_staff_id IS NULL THEN
    RAISE EXCEPTION 'An authenticated staff member is required to submit this transaction';
  END IF;
  IF NOT public.has_any_role(ARRAY['bookkeeper', 'inventory', 'manager']) THEN
    RAISE EXCEPTION 'This role cannot submit transactions for approval';
  END IF;
  IF p_submission_key IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'A valid submission key and transaction payload are required';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('cash_in', 'cash_out', 'noncash') THEN
    RAISE EXCEPTION 'Choose a valid cash-in, cash-out, or noncash direction';
  END IF;
  IF p_source_module IS NULL OR p_transaction_type IS NULL THEN
    RAISE EXCEPTION 'Transaction type and source module are required';
  END IF;
  IF p_transaction_type NOT IN (
    'loan_payment', 'savings_deposit', 'savings_withdrawal', 'time_deposit',
    'time_deposit_withdrawal', 'sale', 'sales_return',
    'operating_expense', 'capital_contribution',
    'approved_dividend', 'other_receipt', 'other_disbursement', 'purchase',
    'bank_transfer'
  ) THEN
    RAISE EXCEPTION 'Unsupported transaction type';
  END IF;
  IF p_source_module NOT IN (
    'bookkeeper.transactions', 'inventory.purchases', 'member.requests', 'manager.transactions'
  ) THEN
    RAISE EXCEPTION 'Unsupported transaction source module';
  END IF;
  IF p_transaction_type IN ('savings_withdrawal', 'time_deposit_withdrawal', 'operating_expense', 'other_disbursement')
     AND p_direction <> 'cash_out' THEN
    RAISE EXCEPTION 'This transaction type must be submitted as a cash-out';
  END IF;
  IF p_transaction_type IN ('loan_payment', 'savings_deposit', 'time_deposit', 'capital_contribution', 'other_receipt')
     AND p_direction <> 'cash_in' THEN
    RAISE EXCEPTION 'This transaction type must be submitted as a cash-in';
  END IF;
  IF p_transaction_type = 'approved_dividend' AND p_direction <> 'noncash' THEN
    RAISE EXCEPTION 'Dividend allocations are noncash unless a separate cash payment is recorded';
  END IF;
  IF p_transaction_type = 'purchase' AND p_direction <> 'noncash' THEN
    RAISE EXCEPTION 'A purchase order must be submitted as a noncash business record; supplier payment is a separate cash-out';
  END IF;
  IF p_transaction_type = 'bank_transfer' AND p_direction <> 'noncash' THEN
    RAISE EXCEPTION 'An internal account transfer must be submitted as noncash';
  END IF;
  IF p_transaction_type = 'sale' AND p_payload #>> '{p_sale,payment_type}' = 'credit'
     AND p_direction <> 'noncash' THEN
    RAISE EXCEPTION 'Credit sales must be recorded as noncash receivables';
  END IF;
  IF p_transaction_type = 'sale' AND p_payload #>> '{p_sale,payment_type}' IS DISTINCT FROM 'credit'
     AND p_payload #>> '{p_sale,flow}' IS DISTINCT FROM 'collection'
     AND p_direction <> 'cash_in' THEN
    RAISE EXCEPTION 'A paid sale must be submitted as cash-in';
  END IF;
  IF p_transaction_type = 'sale'
     AND p_payload #>> '{p_sale,flow}' = 'collection'
     AND p_direction <> 'cash_in' THEN
    RAISE EXCEPTION 'A credit-sale collection must be submitted as cash-in';
  END IF;
  IF p_transaction_type = 'sales_return' AND p_direction <> 'noncash' THEN
    RAISE EXCEPTION 'A credit-sale cancellation must be submitted as noncash';
  END IF;
  CASE
    WHEN p_transaction_type = 'sale' THEN
      IF jsonb_typeof(p_payload->'p_sale') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Sale details are required';
      END IF;
      v_payload_amount := NULLIF(p_payload #>> '{p_sale,amount}', '')::NUMERIC;
      v_payload_member_id := NULLIF(p_payload #>> '{p_sale,member_id}', '')::UUID;
    WHEN p_transaction_type = 'sales_return' THEN
      v_payload_amount := NULLIF(p_payload->>'amount', '')::NUMERIC;
    WHEN p_transaction_type = 'other_receipt' THEN
      v_payload_amount := NULLIF(p_payload #>> '{p_receipt,amount}', '')::NUMERIC;
      v_payload_member_id := NULLIF(p_payload #>> '{p_receipt,member_id}', '')::UUID;
    WHEN p_transaction_type IN ('operating_expense', 'other_disbursement') THEN
      v_payload_amount := NULLIF(p_payload #>> '{p_disbursement,amount}', '')::NUMERIC;
      v_payload_member_id := NULLIF(p_payload #>> '{p_disbursement,member_id}', '')::UUID;
    WHEN p_transaction_type IN ('loan_payment', 'savings_deposit', 'time_deposit',
                                'savings_withdrawal', 'time_deposit_withdrawal',
                                'capital_contribution') THEN
      v_payload_amount := NULLIF(COALESCE(
        p_payload #>> '{p_receipt,amount}',
        p_payload #>> '{p_disbursement,amount}'
      ), '')::NUMERIC;
      v_payload_member_id := NULLIF(COALESCE(
        p_payload #>> '{p_receipt,member_id}',
        p_payload #>> '{p_disbursement,member_id}'
      ), '')::UUID;
    WHEN p_transaction_type = 'approved_dividend' THEN
      v_payload_amount :=
        COALESCE(NULLIF(p_payload #>> '{p_distribution,dividend_amount}', '')::NUMERIC, 0)
        + COALESCE(NULLIF(p_payload #>> '{p_distribution,patronage_amount}', '')::NUMERIC, 0);
      v_payload_member_id := NULLIF(p_payload #>> '{p_distribution,member_id}', '')::UUID;
    WHEN p_transaction_type = 'bank_transfer' THEN
      v_payload_amount := NULLIF(p_payload->>'amount', '')::NUMERIC;
      IF COALESCE(p_payload->>'from_account', '') NOT IN ('Cash on Hand', 'Cash in Bank')
         OR COALESCE(p_payload->>'to_account', '') NOT IN ('Cash on Hand', 'Cash in Bank')
         OR p_payload->>'from_account' = p_payload->>'to_account'
         OR NULLIF(p_payload->>'transfer_date', '') IS NULL
         OR COALESCE(trim(p_payload->>'description'), '') = ''
         OR trim(p_payload->>'description') IS DISTINCT FROM trim(p_description) THEN
        RAISE EXCEPTION 'A valid source, destination, transfer date, and matching description are required';
      END IF;
      IF (p_payload->>'transfer_date')::DATE > (now() AT TIME ZONE 'Asia/Manila')::DATE THEN
        RAISE EXCEPTION 'Transfer date cannot be in the future';
      END IF;
    WHEN p_transaction_type = 'purchase' THEN
      IF p_payload->>'action' IN ('receive', 'cancel') THEN
        v_payload_amount := NULLIF(p_payload->>'amount', '')::NUMERIC;
        IF p_source_record_id IS NULL
           OR NULLIF(p_payload #>> '{purchase,purchase_id}', '')::UUID IS DISTINCT FROM p_source_record_id THEN
          RAISE EXCEPTION 'The purchase action does not match its source record';
        END IF;
      ELSIF p_payload->>'action' = 'create'
            AND jsonb_typeof(p_payload #> '{purchase,items}') = 'array' THEN
        IF p_source_record_id IS NOT NULL
           OR COALESCE(trim(p_payload #>> '{purchase,purchase_number}'), '') = ''
           OR COALESCE(trim(p_payload #>> '{purchase,supplier_name}'), '') = ''
           OR NULLIF(p_payload #>> '{purchase,purchase_date}', '') IS NULL THEN
          RAISE EXCEPTION 'Purchase number, supplier, and purchase date are required';
        END IF;
        v_payload_amount := 0;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload #> '{purchase,items}')
        LOOP
          v_item_quantity := NULLIF(v_item->>'quantity', '')::NUMERIC;
          v_item_cost := NULLIF(v_item->>'unit_cost', '')::NUMERIC;
          IF COALESCE(trim(v_item->>'item_name'), '') = ''
             OR v_item_quantity IS NULL OR v_item_quantity <= 0
             OR v_item_quantity <> trunc(v_item_quantity)
             OR v_item_cost IS NULL OR v_item_cost < 0 THEN
            RAISE EXCEPTION 'Every purchase line needs an item, positive whole quantity, and non-negative unit cost';
          END IF;
          v_payload_amount := v_payload_amount + v_item_quantity * v_item_cost;
          v_item_count := v_item_count + 1;
        END LOOP;
        IF v_item_count = 0 THEN
          RAISE EXCEPTION 'Add at least one item to the purchase';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unsupported purchase workflow action';
      END IF;
  END CASE;
  IF v_payload_amount IS NULL OR round(v_payload_amount, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'The submitted amount does not match the transaction details';
  END IF;
  IF v_payload_member_id IS NOT NULL AND v_payload_member_id IS DISTINCT FROM p_member_id THEN
    RAISE EXCEPTION 'The submitted member does not match the transaction details';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR COALESCE(trim(p_description), '') = '' THEN
    RAISE EXCEPTION 'A positive amount and transaction description are required';
  END IF;
  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF p_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.members WHERE id = p_member_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The selected member does not exist or is archived';
  END IF;

  v_cash_out := p_direction = 'cash_out';
  IF p_transaction_type = 'sale'
     AND p_payload #>> '{p_sale,payment_type}' = 'credit'
     AND p_payload #>> '{p_sale,flow}' IS DISTINCT FROM 'collection' THEN
    v_direction := 'noncash';
    v_cash_out := false;
  END IF;
  v_hash := md5(jsonb_build_object(
    'transaction_type', p_transaction_type,
    'direction', v_direction,
    'source_module', p_source_module,
    'source_record_id', p_source_record_id,
    'member_id', p_member_id,
    'counterparty_name', p_counterparty_name,
    'amount', round(p_amount, 2),
    'payment_method', p_payment_method,
    'description', trim(p_description),
    'payload', p_payload
  )::TEXT);

  SELECT id, submission_hash INTO v_workflow_id, v_existing_hash
  FROM public.transaction_workflows
  WHERE created_by_auth_id = v_auth_id AND submission_key = p_submission_key;
  IF v_workflow_id IS NOT NULL THEN
    IF v_existing_hash <> v_hash THEN
      RAISE EXCEPTION 'This submission key was already used with different transaction details';
    END IF;
    RETURN jsonb_build_object('workflow_id', v_workflow_id, 'accepted', true, 'replayed', true);
  END IF;

  IF p_transaction_type = 'purchase' AND p_payload->>'action' = 'create'
     AND (
       EXISTS (
         SELECT 1 FROM public.purchases
         WHERE purchase_number = trim(p_payload #>> '{purchase,purchase_number}')
       )
       OR EXISTS (
         SELECT 1 FROM public.transaction_workflows workflow
         WHERE workflow.transaction_type = 'purchase'
           AND workflow.status NOT IN ('rejected', 'accounting_error')
           AND workflow.payload->>'action' = 'create'
           AND workflow.payload #>> '{purchase,purchase_number}' =
               trim(p_payload #>> '{purchase,purchase_number}')
       )
     ) THEN
    RAISE EXCEPTION 'Purchase / invoice number % is already in use', p_payload #>> '{purchase,purchase_number}';
  END IF;

  IF p_source_record_id IS NOT NULL THEN
    SELECT id INTO v_workflow_id
    FROM public.transaction_workflows
    WHERE source_module = p_source_module AND source_record_id = p_source_record_id;
    IF v_workflow_id IS NOT NULL THEN
      RAISE EXCEPTION 'A workflow already exists for this source record';
    END IF;
  END IF;

  INSERT INTO public.transaction_workflows (
    transaction_type, direction, source_module, source_record_id, member_id,
    counterparty_name, amount, payment_method, description, payload, status,
    cash_release_required, cash_release_status, created_by, created_by_auth_id,
    submission_key, submission_hash
  ) VALUES (
    p_transaction_type, v_direction, p_source_module, p_source_record_id, p_member_id,
    NULLIF(trim(p_counterparty_name), ''), round(p_amount, 2), p_payment_method,
    trim(p_description), p_payload, 'pending_approval', v_cash_out,
    'not_required', v_staff_id, v_auth_id, p_submission_key, v_hash
  ) RETURNING id INTO v_workflow_id;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, next_status, actor_auth_id, actor_staff_id, snapshot
  ) VALUES (
    v_workflow_id, 'submitted', 'pending_approval', v_auth_id, v_staff_id,
    jsonb_build_object(
      'role', v_actor_role,
      'transaction_type', p_transaction_type,
      'amount', round(p_amount, 2),
      'payload', p_payload
    )
  );
  RETURN jsonb_build_object('workflow_id', v_workflow_id, 'accepted', true, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_transaction_workflow(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_transaction_workflow(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_loan_application_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_auth_id UUID;
  v_member_name TEXT;
  v_workflow_id UUID;
  v_payload JSONB;
BEGIN
  IF NEW.request_type <> 'loan_application' OR NEW.status NOT IN ('pending', 'under_review') THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.user_id
  INTO v_staff_id, v_auth_id
  FROM public.staff s
  WHERE s.id = NEW.requester_id;
  IF v_staff_id IS NULL THEN
    SELECT s.id, s.user_id
    INTO v_staff_id, v_auth_id
    FROM public.staff s
    WHERE s.member_id = NEW.member_id AND s.role = 'member' AND s.is_active
    ORDER BY s.created_at
    LIMIT 1;
  END IF;
  v_auth_id := COALESCE(auth.uid(), v_auth_id);
  IF v_staff_id IS NULL OR v_auth_id IS NULL OR NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Loan application cannot enter approval without a valid requester and amount';
  END IF;

  SELECT trim(concat_ws(' ', first_name, middle_name, last_name))
  INTO v_member_name
  FROM public.members
  WHERE id = NEW.member_id;
  v_payload := jsonb_build_object(
    'request_id', NEW.id,
    'request_number', NEW.request_number,
    'request_data', NEW.request_data
  );
  INSERT INTO public.transaction_workflows (
    transaction_type, direction, source_module, source_record_id, member_id,
    counterparty_name, amount, description, payload, status, created_by,
    created_by_auth_id, submission_key, submission_hash
  ) VALUES (
    'loan_application', 'noncash', 'loan_application', NEW.id, NEW.member_id,
    NULLIF(v_member_name, ''), NEW.amount,
    'Loan application: ' || COALESCE(NULLIF(NEW.request_data->>'purpose', ''), NEW.request_number),
    v_payload, 'pending_approval', v_staff_id, v_auth_id, gen_random_uuid(),
    md5(NEW.id::TEXT || ':' || NEW.amount::TEXT || ':' || v_payload::TEXT)
  )
  ON CONFLICT (source_module, source_record_id) WHERE source_record_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_workflow_id;

  IF v_workflow_id IS NOT NULL THEN
    INSERT INTO public.transaction_workflow_events (
      workflow_id, event_type, next_status, actor_auth_id, actor_staff_id, snapshot
    ) VALUES (
      v_workflow_id, 'submitted', 'pending_approval', v_auth_id, v_staff_id,
      jsonb_build_object('request_id', NEW.id, 'request_number', NEW.request_number, 'request_data', NEW.request_data)
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_loan_application_workflow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS requests_create_transaction_workflow ON public.requests;
CREATE TRIGGER requests_create_transaction_workflow
  AFTER INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.create_loan_application_workflow();

WITH pending_requests AS (
  SELECT
    r.*,
    COALESCE(requester.id, member_user.id) AS workflow_staff_id,
    COALESCE(requester.user_id, member_user.user_id) AS workflow_auth_id,
    trim(concat_ws(' ', m.first_name, m.middle_name, m.last_name)) AS member_name
  FROM public.requests r
  LEFT JOIN public.staff requester ON requester.id = r.requester_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.user_id
    FROM public.staff s
    WHERE s.member_id = r.member_id AND s.role = 'member' AND s.is_active
    ORDER BY s.created_at
    LIMIT 1
  ) member_user ON true
  LEFT JOIN public.members m ON m.id = r.member_id
  WHERE r.request_type = 'loan_application'
    AND r.status IN ('pending', 'under_review')
    AND r.amount > 0
    AND COALESCE(requester.user_id, member_user.user_id) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.transaction_workflows workflow
      WHERE workflow.source_module = 'loan_application'
        AND workflow.source_record_id = r.id
    )
),
created AS (
  INSERT INTO public.transaction_workflows (
    transaction_type, direction, source_module, source_record_id, member_id,
    counterparty_name, amount, description, payload, status, created_by,
    created_by_auth_id, submission_key, submission_hash
  )
  SELECT
    'loan_application', 'noncash', 'loan_application', request.id, request.member_id,
    NULLIF(request.member_name, ''), request.amount,
    'Loan application: ' || COALESCE(NULLIF(request.request_data->>'purpose', ''), request.request_number),
    jsonb_build_object(
      'request_id', request.id,
      'request_number', request.request_number,
      'request_data', request.request_data
    ),
    'pending_approval', request.workflow_staff_id, request.workflow_auth_id,
    gen_random_uuid(),
    md5(request.id::TEXT || ':' || request.amount::TEXT || ':' || request.request_data::TEXT)
  FROM pending_requests request
  ON CONFLICT (source_module, source_record_id) WHERE source_record_id IS NOT NULL
  DO NOTHING
  RETURNING id, created_by_auth_id, created_by
)
INSERT INTO public.transaction_workflow_events (
  workflow_id, event_type, next_status, actor_auth_id, actor_staff_id, snapshot
)
SELECT id, 'submitted', 'pending_approval', created_by_auth_id, created_by,
       jsonb_build_object('imported_existing_request', true)
FROM created;

CREATE OR REPLACE FUNCTION public.review_transaction_workflow(
  p_workflow_id UUID,
  p_decision TEXT,
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
  v_next_status TEXT;
  v_loan RECORD;
  v_release_workflow_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('manager') THEN
    RAISE EXCEPTION 'Only an active Manager can review transactions';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'returned_for_correction') THEN
    RAISE EXCEPTION 'Choose approve, reject, or return for correction';
  END IF;
  IF p_decision <> 'approved' AND COALESCE(trim(p_remarks), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject or return a transaction';
  END IF;

  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;
  IF NOT FOUND OR v_workflow.status NOT IN ('pending_approval', 'returned_for_correction') THEN
    RAISE EXCEPTION 'This transaction is no longer awaiting Manager review';
  END IF;
  IF v_workflow.created_by = v_staff_id THEN
    RAISE EXCEPTION 'A requester cannot approve their own transaction';
  END IF;
  IF v_workflow.transaction_type = 'loan_application' AND p_decision = 'returned_for_correction' THEN
    RAISE EXCEPTION 'Loan applications must be corrected and resubmitted through the loan application flow';
  END IF;

  IF v_workflow.transaction_type = 'loan_application' THEN
    PERFORM public.review_loan_request(
      v_workflow.source_record_id,
      p_decision,
      COALESCE(NULLIF(trim(p_remarks), ''), 'Approved through Transaction Approvals')
    );
  END IF;

  v_next_status := CASE WHEN p_decision = 'returned_for_correction' THEN 'returned_for_correction' ELSE p_decision END;
  UPDATE public.transaction_workflows
  SET status = v_next_status,
      approved_payload = CASE WHEN p_decision = 'approved' THEN payload ELSE approved_payload END,
      manager_id = v_staff_id,
      manager_decision_at = now(),
      manager_remarks = NULLIF(trim(p_remarks), ''),
      updated_at = now()
  WHERE id = p_workflow_id;

  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id,
    actor_staff_id, remarks, snapshot
  ) VALUES (
    p_workflow_id, p_decision, v_workflow.status, v_next_status, v_auth_id,
    v_staff_id, NULLIF(trim(p_remarks), ''),
    jsonb_build_object('amount', v_workflow.amount, 'approved_payload', v_workflow.payload)
  );

  IF v_workflow.transaction_type = 'loan_application' AND p_decision = 'approved' THEN
    SELECT * INTO v_loan
    FROM public.loans
    WHERE request_id = v_workflow.source_record_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approved loan record was not created';
    END IF;
    INSERT INTO public.transaction_workflows (
      transaction_type, direction, source_module, source_record_id, member_id,
      counterparty_name, amount, payment_method, description, payload,
      approved_payload, status, cash_release_required, manager_id,
      manager_decision_at, manager_remarks, created_by, created_by_auth_id,
      submission_key, submission_hash
    ) VALUES (
      'loan_disbursement', 'cash_out', 'loan_application', v_loan.id,
      v_loan.member_id, NULL, v_loan.principal_amount, 'cash',
      'Loan release ' || v_loan.loan_number,
      jsonb_build_object(
        'loan_id', v_loan.id,
        'release_date', NULL,
        'payment_source', 'cash-on-hand'
      ),
      jsonb_build_object(
        'loan_id', v_loan.id,
        'release_date', NULL,
        'payment_source', 'cash-on-hand'
      ),
      'approved', true, v_staff_id, now(), 'Approved loan release',
      v_staff_id, v_auth_id, gen_random_uuid(),
      md5(v_loan.id::TEXT || ':' || v_loan.principal_amount::TEXT)
    )
    ON CONFLICT (source_module, source_record_id) WHERE source_record_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_release_workflow_id;

    IF v_release_workflow_id IS NOT NULL THEN
      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, next_status, actor_auth_id, actor_staff_id, remarks, snapshot
      ) VALUES (
        v_release_workflow_id, 'submitted', 'approved', v_auth_id, v_staff_id,
        'Loan application approved; release workflow created',
        jsonb_build_object('loan_id', v_loan.id, 'amount', v_loan.principal_amount)
      );
      INSERT INTO public.transaction_workflow_events (
        workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id, remarks
      ) VALUES (
        v_release_workflow_id, 'approved', 'pending_approval', 'approved',
        v_auth_id, v_staff_id, 'Release authorization inherited from loan application approval'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', v_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_transaction_workflow(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_transaction_workflow(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_approved_purchase(p_workflow_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_workflow public.transaction_workflows%ROWTYPE;
  v_payload JSONB;
  v_purchase JSONB;
  v_action TEXT;
  v_supplier_id UUID;
  v_purchase_id UUID;
  v_purchase_number TEXT;
  v_purchase_date DATE;
  v_expected_date DATE;
  v_total NUMERIC(15, 2);
  v_receive_now BOOLEAN;
  v_item JSONB;
  v_item_count INTEGER := 0;
  v_status TEXT;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can process an approved purchase';
  END IF;
  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
    AND transaction_type = 'purchase'
    AND status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This purchase is not approved and ready for processing';
  END IF;
  v_payload := v_workflow.approved_payload;
  v_action := v_payload->>'action';

  IF v_action = 'create' THEN
    v_purchase := v_payload->'purchase';
    v_purchase_number := trim(COALESCE(v_purchase->>'purchase_number', ''));
    v_purchase_date := NULLIF(v_purchase->>'purchase_date', '')::DATE;
    v_expected_date := NULLIF(v_purchase->>'expected_delivery_date', '')::DATE;
    v_receive_now := COALESCE((v_purchase->>'receive_now')::BOOLEAN, false);
    IF v_purchase IS NULL OR v_purchase_number = '' OR v_purchase_date IS NULL
       OR COALESCE(trim(v_purchase->>'supplier_name'), '') = ''
       OR jsonb_typeof(v_purchase->'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_purchase->'items') = 0 THEN
      RAISE EXCEPTION 'Purchase order details are incomplete';
    END IF;
    IF v_expected_date IS NOT NULL AND v_expected_date < v_purchase_date THEN
      RAISE EXCEPTION 'Expected delivery cannot be earlier than the purchase date';
    END IF;

    v_total := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_purchase->'items')
    LOOP
      IF COALESCE(trim(v_item->>'item_name'), '') = ''
         OR COALESCE(NULLIF(v_item->>'quantity', '')::INTEGER, 0) <= 0
         OR COALESCE(NULLIF(v_item->>'unit_cost', '')::NUMERIC, -1) < 0 THEN
        RAISE EXCEPTION 'Every purchase line needs an item, positive whole quantity, and non-negative unit cost';
      END IF;
      v_total := v_total
        + (v_item->>'quantity')::INTEGER * (v_item->>'unit_cost')::NUMERIC;
      v_item_count := v_item_count + 1;
    END LOOP;
    IF round(v_total, 2) <= 0 OR round(v_total, 2) <> v_workflow.amount THEN
      RAISE EXCEPTION 'The purchase total does not match the approved amount';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchases WHERE purchase_number = v_purchase_number) THEN
      RAISE EXCEPTION 'Purchase / invoice number % is already recorded', v_purchase_number;
    END IF;

    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE lower(trim(supplier_name)) = lower(trim(v_purchase->>'supplier_name'))
      AND status = 'active'
    ORDER BY created_at
    LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (supplier_code, supplier_name)
      VALUES (
        'SUP-WF-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12)),
        trim(v_purchase->>'supplier_name')
      )
      RETURNING id INTO v_supplier_id;
    END IF;

    INSERT INTO public.purchases (
      purchase_number, supplier_id, purchase_date, expected_delivery_date,
      total_amount, net_amount, payment_status, status, notes, created_by,
      approved_by, approved_at
    ) VALUES (
      v_purchase_number, v_supplier_id, v_purchase_date, v_expected_date,
      round(v_total, 2), round(v_total, 2), 'pending',
      CASE WHEN v_receive_now THEN 'received' ELSE 'ordered' END,
      NULLIF(trim(v_purchase->>'notes'), ''), v_workflow.bookkeeper_id,
      v_workflow.manager_id, v_workflow.manager_decision_at
    )
    RETURNING id INTO v_purchase_id;

    INSERT INTO public.purchase_items (
      purchase_id, product_id, item_name, unit, quantity, unit_cost,
      line_total, received_quantity
    )
    SELECT
      v_purchase_id, NULL, trim(item->>'item_name'),
      NULLIF(trim(item->>'unit'), ''),
      (item->>'quantity')::INTEGER,
      (item->>'unit_cost')::NUMERIC,
      round((item->>'quantity')::INTEGER * (item->>'unit_cost')::NUMERIC, 2),
      CASE WHEN v_receive_now THEN (item->>'quantity')::INTEGER ELSE 0 END
    FROM jsonb_array_elements(v_purchase->'items') item;

    RETURN jsonb_build_object(
      'purchase_id', v_purchase_id,
      'purchase_number', v_purchase_number,
      'status', CASE WHEN v_receive_now THEN 'received' ELSE 'ordered' END,
      'total_amount', round(v_total, 2),
      'item_count', v_item_count
    );
  ELSIF v_action = 'receive' THEN
    v_purchase_id := NULLIF(v_payload #>> '{purchase,purchase_id}', '')::UUID;
    SELECT purchase_number, status INTO v_purchase_number, v_status
    FROM public.purchases
    WHERE id = v_purchase_id
    FOR UPDATE;
    IF NOT FOUND OR v_status IN ('received', 'cancelled') THEN
      RAISE EXCEPTION 'This purchase cannot be received';
    END IF;
    UPDATE public.purchase_items
    SET received_quantity = quantity
    WHERE purchase_id = v_purchase_id;
    UPDATE public.purchases
    SET status = 'received', updated_at = now()
    WHERE id = v_purchase_id;
    RETURN jsonb_build_object('purchase_id', v_purchase_id, 'purchase_number', v_purchase_number, 'status', 'received');
  ELSIF v_action = 'cancel' THEN
    v_purchase_id := NULLIF(v_payload #>> '{purchase,purchase_id}', '')::UUID;
    UPDATE public.purchases
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_purchase_id AND status IN ('draft', 'ordered')
    RETURNING purchase_number INTO v_purchase_number;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only an unreceived purchase can be cancelled';
    END IF;
    RETURN jsonb_build_object('purchase_id', v_purchase_id, 'purchase_number', v_purchase_number, 'status', 'cancelled');
  END IF;

  RAISE EXCEPTION 'Unsupported approved purchase action';
END;
$$;
REVOKE ALL ON FUNCTION public.process_approved_purchase(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_transaction_workflow(p_workflow_id UUID)
RETURNS JSONB
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
  v_business_table TEXT;
  v_business_id UUID;
  v_journal_id UUID;
  v_source_account_id UUID;
  v_destination_account_id UUID;
  v_source_account_count INTEGER;
  v_destination_account_count INTEGER;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can process transactions';
  END IF;
  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = p_workflow_id
  FOR UPDATE;
  IF NOT FOUND OR v_workflow.status <> 'approved' THEN
    RAISE EXCEPTION 'This transaction is not approved and ready for processing';
  END IF;
  IF v_workflow.transaction_type = 'loan_application' THEN
    RAISE EXCEPTION 'Process the approved loan release, not the application record';
  END IF;

  v_payload := v_workflow.approved_payload;
  IF v_workflow.cash_release_required THEN
    UPDATE public.transaction_workflows
    SET status = 'awaiting_release',
        cash_release_status = 'awaiting_release',
        accounting_status = 'processing',
        bookkeeper_id = v_staff_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_workflow_id;
    INSERT INTO public.transaction_workflow_events (
      workflow_id, event_type, previous_status, next_status, actor_auth_id,
      actor_staff_id, snapshot
    ) VALUES (
      p_workflow_id, 'processed', 'approved', 'awaiting_release', v_auth_id,
      v_staff_id, jsonb_build_object('amount', v_workflow.amount, 'payload', v_payload)
    );
    RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', 'awaiting_release');
  END IF;

  UPDATE public.transaction_workflows
  SET status = 'processing', accounting_status = 'processing',
      bookkeeper_id = v_staff_id, updated_at = now()
  WHERE id = p_workflow_id;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id
  ) VALUES (p_workflow_id, 'processing_started', 'approved', 'processing', v_auth_id, v_staff_id);

  BEGIN
    IF v_workflow.transaction_type = 'sale' THEN
      v_result := public.record_cooperative_sale(v_payload->'p_sale');
      v_business_table := 'sales_orders';
      v_business_id := NULLIF(v_result->>'sales_order_id', '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
    ELSIF v_workflow.transaction_type = 'sales_return' THEN
      v_result := public.cancel_credit_sale(
        (v_payload->>'p_sales_order_id')::UUID,
        v_payload->>'p_reason',
        COALESCE(v_payload->'p_returned_items', '[]'::JSONB)
      );
      v_business_table := 'sales_orders';
      v_business_id := NULLIF(v_result->>'sales_order_id', '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
    ELSIF v_workflow.transaction_type = 'other_receipt' THEN
      v_result := public.save_cash_receipt(v_payload->'p_receipt', v_payload->'p_allocations');
      v_business_table := 'cash_receipts';
      v_business_id := NULLIF(v_result->>'receipt_id', '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
    ELSIF v_workflow.transaction_type = 'approved_dividend' THEN
      v_result := public.record_member_dividend(v_payload->'p_distribution');
      v_business_table := 'member_dividend_distributions';
      v_business_id := NULLIF(v_result->>'distribution_id', '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
    ELSIF v_workflow.transaction_type IN (
      'loan_payment', 'savings_deposit', 'time_deposit', 'capital_contribution'
    ) THEN
      v_result := public.record_member_financial_entry(
        CASE WHEN v_payload->'p_receipt' = 'null'::JSONB THEN NULL ELSE v_payload->'p_receipt' END,
        CASE WHEN v_payload->'p_disbursement' = 'null'::JSONB THEN NULL ELSE v_payload->'p_disbursement' END,
        v_payload->'p_entry'
      );
      v_business_table := CASE WHEN v_result ? 'receipt_id' THEN 'cash_receipts' ELSE 'loan_payments' END;
      v_business_id := NULLIF(COALESCE(v_result->>'receipt_id', v_result->>'disbursement_id'), '')::UUID;
      v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
    ELSIF v_workflow.transaction_type = 'purchase' THEN
      v_result := public.process_approved_purchase(p_workflow_id);
      v_business_table := 'purchases';
      v_business_id := NULLIF(v_result->>'purchase_id', '')::UUID;
    ELSIF v_workflow.transaction_type = 'bank_transfer' THEN
      SELECT count(*), (array_agg(id))[1]
      INTO v_source_account_count, v_source_account_id
      FROM public.chart_of_accounts
      WHERE account_name = v_payload->>'from_account'
        AND account_type = 'asset'
        AND is_active;
      SELECT count(*), (array_agg(id))[1]
      INTO v_destination_account_count, v_destination_account_id
      FROM public.chart_of_accounts
      WHERE account_name = v_payload->>'to_account'
        AND account_type = 'asset'
        AND is_active;
      IF v_source_account_count <> 1 OR v_destination_account_count <> 1 THEN
        RAISE EXCEPTION 'Each transfer account must resolve to one active asset account';
      END IF;
      IF v_source_account_id = v_destination_account_id THEN
        RAISE EXCEPTION 'Transfer source and destination must be different accounts';
      END IF;
      v_journal_id := public.post_journal_entry(
        jsonb_build_object(
          'entry_date', v_payload->>'transfer_date',
          'description', v_payload->>'description',
          'reference_number', v_payload->>'reference_number',
          'entry_type', 'general'
        ),
        jsonb_build_array(
          jsonb_build_object(
            'account_id', v_destination_account_id,
            'debit_amount', v_workflow.amount,
            'credit_amount', 0,
            'description', 'Internal transfer received'
          ),
          jsonb_build_object(
            'account_id', v_source_account_id,
            'debit_amount', 0,
            'credit_amount', v_workflow.amount,
            'description', 'Internal transfer sent'
          )
        )
      );
      v_result := jsonb_build_object('journal_entry_id', v_journal_id);
      v_business_table := 'journal_entries';
      v_business_id := v_journal_id;
    ELSE
      RAISE EXCEPTION 'This transaction type does not have a configured accounting processor';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.transaction_workflows
    SET status = 'accounting_error', accounting_status = 'error',
        updated_at = now()
    WHERE id = p_workflow_id;
    INSERT INTO public.transaction_workflow_events (
      workflow_id, event_type, previous_status, next_status, actor_auth_id,
      actor_staff_id, remarks
    ) VALUES (
      p_workflow_id, 'processing_failed', 'processing', 'accounting_error',
      v_auth_id, v_staff_id, SQLERRM
    );
    RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', 'accounting_error', 'error', SQLERRM);
  END;

  UPDATE public.transaction_workflows
  SET status = 'completed',
      accounting_status = 'posted',
      business_record_table = v_business_table,
      business_record_id = v_business_id,
      journal_entry_id = v_journal_id,
      processed_at = now(),
      updated_at = now()
  WHERE id = p_workflow_id;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id,
    actor_staff_id, snapshot
  ) VALUES (
    p_workflow_id, 'processed', 'processing', 'completed', v_auth_id, v_staff_id,
    jsonb_build_object('result', v_result, 'journal_entry_id', v_journal_id)
  );
  RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', 'completed', 'result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.process_transaction_workflow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_transaction_workflow(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.workflow_disbursement_authorized(p_disbursement JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_workflow_id UUID := NULLIF(p_disbursement->>'workflow_id', '')::UUID;
  v_workflow public.transaction_workflows%ROWTYPE;
  v_loan_number TEXT;
BEGIN
  IF NOT public.has_role('treasurer') THEN RETURN false; END IF;
  IF v_workflow_id IS NOT NULL THEN
    SELECT * INTO v_workflow FROM public.transaction_workflows
    WHERE id = v_workflow_id AND status = 'awaiting_release' AND cash_release_required;
  ELSE
    v_loan_number := substring(p_disbursement->>'description' FROM '^Loan release (.+)$');
    SELECT workflow.* INTO v_workflow
    FROM public.transaction_workflows workflow
    JOIN public.loans loan ON loan.id = NULLIF(workflow.payload->>'loan_id', '')::UUID
    WHERE workflow.transaction_type = 'loan_disbursement'
      AND workflow.status = 'awaiting_release'
      AND workflow.cash_release_required
      AND loan.loan_number = v_loan_number
      AND loan.member_id = NULLIF(p_disbursement->>'member_id', '')::UUID
      AND loan.principal_amount = NULLIF(p_disbursement->>'amount', '')::NUMERIC;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_workflow.direction <> 'cash_out'
     OR v_workflow.amount <> NULLIF(p_disbursement->>'amount', '')::NUMERIC THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.transaction_workflow_documents
    WHERE workflow_id = v_workflow.id AND document_type = 'cash_release_acknowledgment'
  );
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
  v_workflow_id UUID := NULLIF(COALESCE(p_disbursement->>'workflow_id', p_entry->>'workflow_id'), '')::UUID;
  v_workflow public.transaction_workflows%ROWTYPE;
  v_type TEXT := p_entry->>'entry_type';
  v_member_id UUID := NULLIF(COALESCE(p_disbursement->>'member_id', p_entry->>'member_id'), '')::UUID;
  v_amount NUMERIC := NULLIF(COALESCE(p_disbursement->>'amount', p_entry->>'amount'), '')::NUMERIC;
BEGIN
  IF NOT public.has_role('treasurer') OR v_workflow_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_workflow
  FROM public.transaction_workflows
  WHERE id = v_workflow_id AND status = 'awaiting_release' AND cash_release_required;
  IF NOT FOUND OR v_workflow.transaction_type <> v_type THEN RETURN false; END IF;
  RETURN v_workflow.member_id = v_member_id
    AND v_workflow.amount = v_amount
    AND EXISTS (
      SELECT 1 FROM public.transaction_workflow_documents
      WHERE workflow_id = v_workflow.id AND document_type = 'cash_release_acknowledgment'
    );
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
    WHERE workflow.transaction_type = 'loan_disbursement'
      AND workflow.status = 'awaiting_release'
      AND workflow.cash_release_required
      AND NULLIF(workflow.payload->>'loan_id', '')::UUID = p_loan_id
  );
$$;
REVOKE ALL ON FUNCTION public.workflow_loan_release_authorized(UUID) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
  v_replaced BOOLEAN;
  v_signatures TEXT[] := ARRAY[
    'public.save_cash_disbursement_core(jsonb,jsonb)',
    'public.save_cash_disbursement_before_auto_voucher_number(jsonb,jsonb)',
    'public.save_cash_disbursement(jsonb,jsonb)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    SELECT pg_get_functiondef(v_signature::REGPROCEDURE) INTO v_definition;
    v_replaced := false;
    v_old := 'IF NOT public.has_role(''bookkeeper'') THEN';
    v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_disbursement_authorized(p_disbursement) THEN';
    IF position(v_old IN v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old, v_new);
      v_replaced := true;
    END IF;
    v_old := 'IF v_staff_id IS NULL OR NOT public.has_role(''bookkeeper'') THEN';
    v_new := 'IF v_staff_id IS NULL OR (NOT public.has_role(''bookkeeper'') AND NOT public.workflow_disbursement_authorized(p_disbursement)) THEN';
    IF position(v_old IN v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old, v_new);
      v_replaced := true;
    END IF;
    IF NOT v_replaced THEN
      RAISE EXCEPTION 'Could not safely extend authorization for %', v_signature;
    END IF;
    EXECUTE v_definition;
  END LOOP;

  v_signature := 'public.record_member_financial_entry_before_auto_receipt(jsonb,jsonb,jsonb)';
  SELECT pg_get_functiondef(v_signature::REGPROCEDURE) INTO v_definition;
  v_old := 'IF NOT public.has_role(''bookkeeper'') THEN';
  v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_member_entry_authorized(p_entry, p_disbursement) THEN';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely extend member financial entry authorization';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_signature := 'public.record_loan_disbursement(uuid,text,date,text)';
  SELECT pg_get_functiondef(v_signature::REGPROCEDURE) INTO v_definition;
  v_old := 'IF NOT public.has_role(''bookkeeper'') THEN';
  v_new := 'IF NOT public.has_role(''bookkeeper'') AND NOT public.workflow_loan_release_authorized(p_loan_id) THEN';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely extend loan release authorization';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_transaction_workflow_document(
  p_workflow_id UUID,
  p_document_type TEXT,
  p_object_name TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
  v_document_id UUID;
  v_object storage.objects%ROWTYPE;
BEGIN
  IF v_auth_id IS NULL OR NOT public.can_upload_transaction_workflow_document(p_workflow_id) THEN
    RAISE EXCEPTION 'You are not allowed to attach evidence to this transaction';
  END IF;
  IF p_document_type NOT IN ('approval', 'payment_receipt', 'cash_release_acknowledgment', 'supplier_invoice', 'purchase_document', 'loan_document', 'other_evidence')
     OR p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png')
     OR p_file_size <= 0 OR p_file_size > 10485760
     OR COALESCE(trim(p_file_name), '') = ''
     OR p_object_name NOT LIKE p_workflow_id::TEXT || '/%' THEN
    RAISE EXCEPTION 'Document details are invalid';
  END IF;
  SELECT * INTO v_object
  FROM storage.objects
  WHERE bucket_id = 'transaction-evidence' AND name = p_object_name;
  IF NOT FOUND
     OR COALESCE(v_object.metadata->>'mimetype', '') <> p_mime_type
     OR COALESCE(NULLIF(v_object.metadata->>'size', '')::BIGINT, -1) <> p_file_size THEN
    RAISE EXCEPTION 'The uploaded file could not be verified by storage';
  END IF;

  INSERT INTO public.transaction_workflow_documents (
    workflow_id, document_type, object_name, file_name, mime_type,
    file_size, uploaded_by_auth_id, uploaded_by_staff_id
  ) VALUES (
    p_workflow_id, p_document_type, p_object_name, trim(p_file_name),
    p_mime_type, p_file_size, v_auth_id, v_staff_id
  ) RETURNING id INTO v_document_id;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, next_status, actor_auth_id, actor_staff_id, remarks
  ) SELECT p_workflow_id, 'document_attached', status, v_auth_id, v_staff_id, trim(p_file_name)
    FROM public.transaction_workflows WHERE id = p_workflow_id;
  RETURN v_document_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_transaction_workflow_document(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_transaction_workflow_document(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

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
    v_result := public.record_loan_disbursement(
      v_loan_id,
      p_workflow_id::TEXT,
      COALESCE(NULLIF(v_payload->>'release_date', '')::DATE, CURRENT_DATE),
      COALESCE(NULLIF(v_payload->>'payment_source', ''), 'cash-on-hand')
    );
    v_business_table := 'cash_disbursements';
    v_business_id := NULLIF(v_result->>'disbursement_id', '')::UUID;
    v_journal_id := NULLIF(v_result->>'journal_entry_id', '')::UUID;
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
      'result', v_result
    )
  );
  RETURN jsonb_build_object('workflow_id', p_workflow_id, 'status', 'completed', 'result', v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_transaction_workflow_release(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transaction_workflow_release(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_transaction_workflow_on_hold(
  p_workflow_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
  v_old_status TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') OR COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'An active Treasurer and a hold reason are required';
  END IF;
  SELECT status INTO v_old_status
  FROM public.transaction_workflows
  WHERE id = p_workflow_id AND cash_release_required
    AND status IN ('awaiting_release', 'release_issue')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This release cannot be placed on hold'; END IF;
  UPDATE public.transaction_workflows
  SET status = 'on_hold', cash_release_status = 'on_hold',
      release_remarks = trim(p_reason), updated_at = now()
  WHERE id = p_workflow_id;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id, remarks
  ) VALUES (p_workflow_id, 'release_on_hold', v_old_status, 'on_hold', v_auth_id, v_staff_id, trim(p_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.place_transaction_workflow_on_hold(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_transaction_workflow_on_hold(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_transaction_workflow_release_issue(
  p_workflow_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
  v_old_status TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') OR COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'An active Treasurer and a discrepancy reason are required';
  END IF;
  SELECT status INTO v_old_status
  FROM public.transaction_workflows
  WHERE id = p_workflow_id AND cash_release_required
    AND status IN ('awaiting_release', 'on_hold')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This release issue cannot be reported'; END IF;
  UPDATE public.transaction_workflows
  SET status = 'release_issue', cash_release_status = 'release_issue',
      release_remarks = trim(p_reason), updated_at = now()
  WHERE id = p_workflow_id;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id, remarks
  ) VALUES (p_workflow_id, 'release_issue_reported', v_old_status, 'release_issue', v_auth_id, v_staff_id, trim(p_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.report_transaction_workflow_release_issue(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_transaction_workflow_release_issue(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_transaction_workflow_cash_received(
  p_workflow_id UUID,
  p_remarks TEXT
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_auth_id UUID := auth.uid();
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can verify cash received';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.transaction_workflows
    WHERE id = p_workflow_id AND direction = 'cash_in' AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Only completed cash-in transactions can be verified';
  END IF;
  INSERT INTO public.transaction_workflow_events (
    workflow_id, event_type, previous_status, next_status, actor_auth_id, actor_staff_id, remarks
  ) VALUES (p_workflow_id, 'cash_received_verified', 'completed', 'completed', v_auth_id, v_staff_id, NULLIF(trim(p_remarks), ''))
  ON CONFLICT (workflow_id) WHERE event_type = 'cash_received_verified'
  DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_transaction_workflow_cash_received(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_transaction_workflow_cash_received(UUID, TEXT) TO authenticated;

-- Existing financial RPCs are retained for internal posting, but direct staff
-- calls are disabled so new transactions cannot bypass the workflow.
REVOKE EXECUTE ON FUNCTION public.save_cash_receipt(JSONB, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_member_dividend(JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_cooperative_sale(JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_loan_disbursement(UUID, TEXT, DATE, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_loan_request(UUID, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_credit_sale(UUID, TEXT, JSONB) FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.purchases, public.purchase_items FROM PUBLIC, anon, authenticated;

-- Old locally queued financial operations are rejected at sync. Their local
-- records remain available for review; they are never posted without approval.
DO $$
DECLARE
  v_definition TEXT;
  v_old TEXT := 'IF p_operation_type = ''inventory_movement'' THEN';
  v_new TEXT := 'IF p_operation_type IN (''member_financial_entry'', ''cash_receipt'', ''cash_disbursement'', ''cooperative_sale'', ''member_dividend'', ''cash_receipt_delete'', ''cash_disbursement_delete'') THEN RAISE EXCEPTION ''Financial operations must be submitted to the transaction approval workflow''; END IF; IF p_operation_type = ''inventory_movement'' THEN';
BEGIN
  SELECT pg_get_functiondef('public.sync_offline_operation(uuid,text,jsonb)'::REGPROCEDURE)
  INTO v_definition;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely guard legacy offline financial operations';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

COMMIT;

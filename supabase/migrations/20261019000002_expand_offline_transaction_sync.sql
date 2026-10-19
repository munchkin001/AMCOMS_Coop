BEGIN;

ALTER TABLE public.offline_sync_operations
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

ALTER TABLE public.offline_sync_operations
  DROP CONSTRAINT IF EXISTS offline_sync_operations_operation_type_check;

ALTER TABLE public.offline_sync_operations
  ADD CONSTRAINT offline_sync_operations_operation_type_check
  CHECK (
    operation_type IN (
      'inventory_movement',
      'member_contact_update',
      'member_financial_entry',
      'cash_receipt',
      'cash_disbursement',
      'cooperative_sale',
      'member_dividend',
      'loan_application',
      'production_record',
      'journal_entry',
      'journal_reversal',
      'cash_receipt_delete',
      'cash_disbursement_delete'
    )
  );

CREATE OR REPLACE FUNCTION public.sync_offline_operation(
  p_operation_id UUID,
  p_operation_type TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  inserted_rows INTEGER;
  existing_type TEXT;
  existing_payload_hash TEXT;
  existing_response JSONB;
  operation_response JSONB;
  operation_result JSONB;
  movement_id UUID;
  request_id UUID;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to synchronize changes';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A valid operation ID is required';
  END IF;
  IF p_operation_type IS NULL OR p_operation_type NOT IN (
    'inventory_movement',
    'member_contact_update',
    'member_financial_entry',
    'cash_receipt',
    'cash_disbursement',
    'cooperative_sale',
    'member_dividend',
    'loan_application',
    'production_record',
    'journal_entry',
    'journal_reversal',
    'cash_receipt_delete',
    'cash_disbursement_delete'
  ) THEN
    RAISE EXCEPTION 'Unsupported offline operation type';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'A valid operation payload is required';
  END IF;

  INSERT INTO public.offline_sync_operations (user_id, operation_id, operation_type, payload_hash)
  VALUES (authenticated_user_id, p_operation_id, p_operation_type, md5(p_payload::TEXT))
  ON CONFLICT (user_id, operation_id) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows = 0 THEN
    SELECT operation_type, response, payload_hash
      INTO existing_type, existing_response, existing_payload_hash
    FROM public.offline_sync_operations
    WHERE user_id = authenticated_user_id
      AND operation_id = p_operation_id;

    IF existing_type <> p_operation_type THEN
      RAISE EXCEPTION 'Operation ID was already used for a different operation';
    END IF;
    IF existing_payload_hash IS NOT NULL AND existing_payload_hash <> md5(p_payload::TEXT) THEN
      RAISE EXCEPTION 'Operation ID was already used with different operation details';
    END IF;
    IF existing_response IS NULL THEN
      RAISE EXCEPTION 'The previous operation is still being processed';
    END IF;

    RETURN existing_response || jsonb_build_object('replayed', true);
  END IF;

  IF p_operation_type = 'inventory_movement' THEN
    IF jsonb_typeof(p_payload -> 'productId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload -> 'movementType') IS DISTINCT FROM 'string'
       OR (
         jsonb_typeof(p_payload -> 'quantity') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'quantity') IS DISTINCT FROM 'string'
       )
       OR (
         jsonb_typeof(p_payload -> 'direction') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'direction') IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload -> 'date') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Inventory movement details are incomplete';
    END IF;

    movement_id := public.record_inventory_movement(
      (p_payload ->> 'productId')::UUID,
      p_payload ->> 'movementType',
      (p_payload ->> 'quantity')::INTEGER,
      (p_payload ->> 'direction')::INTEGER,
      (p_payload ->> 'date')::DATE,
      p_payload ->> 'reference',
      p_payload ->> 'description',
      NULLIF(p_payload ->> 'unitCost', '')::NUMERIC
    );
    operation_result := jsonb_build_object('movementId', movement_id);
  ELSIF p_operation_type = 'member_contact_update' THEN
    PERFORM public.update_own_profile(p_payload);
    operation_result := jsonb_build_object('profileUpdated', true);
  ELSIF p_operation_type = 'member_financial_entry' THEN
    IF jsonb_typeof(p_payload -> 'p_entry') IS DISTINCT FROM 'object'
       OR (
         jsonb_typeof(p_payload -> 'p_receipt') IS DISTINCT FROM 'object'
         AND jsonb_typeof(p_payload -> 'p_receipt') IS DISTINCT FROM 'null'
       )
       OR (
         jsonb_typeof(p_payload -> 'p_disbursement') IS DISTINCT FROM 'object'
         AND jsonb_typeof(p_payload -> 'p_disbursement') IS DISTINCT FROM 'null'
       ) THEN
      RAISE EXCEPTION 'Member financial entry details are incomplete';
    END IF;

    operation_result := public.record_member_financial_entry(
      CASE WHEN p_payload -> 'p_receipt' = 'null'::JSONB
        THEN NULL ELSE p_payload -> 'p_receipt' END,
      CASE WHEN p_payload -> 'p_disbursement' = 'null'::JSONB
        THEN NULL ELSE p_payload -> 'p_disbursement' END,
      p_payload -> 'p_entry'
    );
  ELSIF p_operation_type = 'cash_receipt' THEN
    IF jsonb_typeof(p_payload -> 'p_receipt') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload -> 'p_allocations') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Cash receipt details are incomplete';
    END IF;
    operation_result := public.save_cash_receipt(
      p_payload -> 'p_receipt',
      p_payload -> 'p_allocations'
    );
  ELSIF p_operation_type = 'cash_disbursement' THEN
    IF jsonb_typeof(p_payload -> 'p_disbursement') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload -> 'p_allocations') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Cash disbursement details are incomplete';
    END IF;
    operation_result := public.save_cash_disbursement(
      p_payload -> 'p_disbursement',
      p_payload -> 'p_allocations'
    );
  ELSIF p_operation_type = 'cooperative_sale' THEN
    IF jsonb_typeof(p_payload -> 'p_sale') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Sales transaction details are incomplete';
    END IF;
    operation_result := public.record_cooperative_sale(p_payload -> 'p_sale');
  ELSIF p_operation_type = 'member_dividend' THEN
    IF jsonb_typeof(p_payload -> 'p_distribution') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Dividend distribution details are incomplete';
    END IF;
    operation_result := public.record_member_dividend(p_payload -> 'p_distribution');
  ELSIF p_operation_type = 'loan_application' THEN
    IF (
         jsonb_typeof(p_payload -> 'p_amount') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'p_amount') IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload -> 'p_loan_type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload -> 'p_purpose') IS DISTINCT FROM 'string'
       OR (
         jsonb_typeof(p_payload -> 'p_term_months') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'p_term_months') IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload -> 'p_frequency') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Loan application details are incomplete';
    END IF;
    request_id := public.submit_loan_request(
      (p_payload ->> 'p_amount')::NUMERIC,
      p_payload ->> 'p_loan_type',
      p_payload ->> 'p_purpose',
      (p_payload ->> 'p_term_months')::INTEGER,
      p_payload ->> 'p_frequency'
    );
    operation_result := jsonb_build_object('requestId', request_id);
  ELSIF p_operation_type = 'production_record' THEN
    IF jsonb_typeof(p_payload -> 'p_production_number') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload -> 'p_product_id') IS DISTINCT FROM 'string'
       OR (
         jsonb_typeof(p_payload -> 'p_quantity') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'p_quantity') IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload -> 'p_production_date') IS DISTINCT FROM 'string'
       OR (
         jsonb_typeof(p_payload -> 'p_unit_cost') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'p_unit_cost') IS DISTINCT FROM 'string'
       ) THEN
      RAISE EXCEPTION 'Production record details are incomplete';
    END IF;
    request_id := public.record_production_with_inventory(
      p_payload ->> 'p_production_number',
      (p_payload ->> 'p_product_id')::UUID,
      (p_payload ->> 'p_quantity')::INTEGER,
      (p_payload ->> 'p_production_date')::DATE,
      (p_payload ->> 'p_unit_cost')::NUMERIC,
      p_payload ->> 'p_batch_number',
      p_payload ->> 'p_notes'
    );
    operation_result := jsonb_build_object('productionRecordId', request_id);
  ELSIF p_operation_type = 'journal_entry' THEN
    IF jsonb_typeof(p_payload -> 'p_entry') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload -> 'p_lines') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Journal entry details are incomplete';
    END IF;
    PERFORM public.post_journal_entry(p_payload -> 'p_entry', p_payload -> 'p_lines');
    operation_result := jsonb_build_object('posted', true);
  ELSIF p_operation_type = 'journal_reversal' THEN
    IF jsonb_typeof(p_payload -> 'p_entry_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload -> 'p_reason') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Journal reversal details are incomplete';
    END IF;
    PERFORM public.reverse_journal_entry(
      (p_payload ->> 'p_entry_id')::UUID,
      p_payload ->> 'p_reason'
    );
    operation_result := jsonb_build_object('reversed', true);
  ELSIF p_operation_type = 'cash_receipt_delete' THEN
    IF jsonb_typeof(p_payload -> 'p_receipt_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Cash receipt ID is required';
    END IF;
    PERFORM public.delete_cash_receipt((p_payload ->> 'p_receipt_id')::UUID);
    operation_result := jsonb_build_object('deleted', true);
  ELSIF p_operation_type = 'cash_disbursement_delete' THEN
    IF jsonb_typeof(p_payload -> 'p_disbursement_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Cash disbursement ID is required';
    END IF;
    PERFORM public.delete_cash_disbursement((p_payload ->> 'p_disbursement_id')::UUID);
    operation_result := jsonb_build_object('deleted', true);
  END IF;

  operation_response := jsonb_build_object(
    'accepted', true,
    'stored', true,
    'operationId', p_operation_id,
    'replayed', false,
    'result', operation_result,
    'serverConfirmedAt', clock_timestamp()
  );

  UPDATE public.offline_sync_operations
  SET response = operation_response
  WHERE user_id = authenticated_user_id
    AND operation_id = p_operation_id;

  RETURN operation_response;
END;
$$;

COMMENT ON FUNCTION public.sync_offline_operation(UUID, TEXT, JSONB) IS
  'Applies authenticated offline operations once per user and operation ID through the existing role-checked transaction RPCs. Loan approvals, loan releases, purchase receiving, and member archival are intentionally not queueable.';

COMMIT;

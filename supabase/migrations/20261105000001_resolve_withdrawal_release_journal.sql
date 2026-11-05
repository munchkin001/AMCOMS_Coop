-- Member withdrawal posting returns its disbursement ID without the linked
-- journal entry ID. Resolve it from the posted disbursement before validating
-- and completing the Treasurer's handoff.

BEGIN;

DO $$
DECLARE
  v_signature REGPROCEDURE := 'public.confirm_transaction_workflow_release(uuid,uuid,text)'::REGPROCEDURE;
  v_definition TEXT;
  v_old TEXT := $old$  IF v_business_id IS NULL OR v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Cash release did not return a posted business record and journal entry';
  END IF;$old$;
  v_new TEXT := $new$  IF v_business_table = 'cash_disbursements'
     AND v_business_id IS NOT NULL
     AND v_journal_id IS NULL THEN
    SELECT disbursement.journal_entry_id
    INTO v_journal_id
    FROM public.cash_disbursements disbursement
    WHERE disbursement.id = v_business_id;
  END IF;

  IF v_business_id IS NULL OR v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Cash release did not return a posted business record and journal entry';
  END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Could not find confirm_transaction_workflow_release';
  END IF;
  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely add withdrawal journal-entry resolution to confirm_transaction_workflow_release';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

COMMIT;

BEGIN;

DO $$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_signatures TEXT[] := ARRAY[
    'public.workflow_disbursement_authorized(jsonb)',
    'public.workflow_member_entry_authorized(jsonb,jsonb)',
    'public.workflow_loan_release_authorized(uuid)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    SELECT pg_get_functiondef(v_signature::REGPROCEDURE)
    INTO v_definition;

    IF v_definition IS NULL THEN
      RAISE EXCEPTION 'Required release authorization function % does not exist', v_signature;
    END IF;

    v_updated_definition := replace(
      v_definition,
      'v_workflow.status <> ''awaiting_release''',
      'v_workflow.status NOT IN (''awaiting_release'', ''on_hold'', ''release_issue'')'
    );
    v_updated_definition := replace(
      v_updated_definition,
      'workflow.status = ''awaiting_release''',
      'workflow.status IN (''awaiting_release'', ''on_hold'', ''release_issue'')'
    );

    IF v_updated_definition = v_definition
       AND (
         position('on_hold' IN v_definition) = 0
         OR position('release_issue' IN v_definition) = 0
       ) THEN
      RAISE EXCEPTION 'Could not safely extend release authorization in %', v_signature;
    END IF;

    IF v_updated_definition <> v_definition THEN
      EXECUTE v_updated_definition;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

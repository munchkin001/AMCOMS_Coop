-- A Treasurer confirms the real-world cash handoff; AMCOMS records the
-- corresponding disbursement and accounting entry. Do not recreate an active
-- loan's repayment schedule.

BEGIN;

WITH candidates AS (
  SELECT disbursement.id AS disbursement_id,
         loan.id AS loan_id,
         count(*) OVER (PARTITION BY disbursement.id) AS disbursement_matches,
         count(*) OVER (PARTITION BY loan.id) AS loan_matches
  FROM public.cash_disbursements disbursement
  JOIN public.loans loan
    ON disbursement.description = 'Loan release ' || loan.loan_number
   AND disbursement.member_id = loan.member_id
   AND disbursement.amount = loan.principal_amount
  JOIN public.journal_entries journal
    ON journal.id = disbursement.journal_entry_id
   AND journal.status = 'posted'
  WHERE disbursement.status = 'recorded'
    AND disbursement.loan_id IS NULL
    AND loan.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.cash_disbursements linked
      WHERE linked.loan_id = loan.id
    )
),
unambiguous_matches AS (
  SELECT disbursement_id, loan_id
  FROM candidates
  WHERE disbursement_matches = 1
    AND loan_matches = 1
)
UPDATE public.cash_disbursements disbursement
SET loan_id = matches.loan_id
FROM unambiguous_matches matches
WHERE disbursement.id = matches.disbursement_id;

UPDATE public.transaction_workflows workflow
SET status = 'completed',
    cash_release_status = 'released',
    accounting_status = 'posted',
    business_record_table = 'cash_disbursements',
    business_record_id = disbursement.id,
    journal_entry_id = disbursement.journal_entry_id,
    released_at = COALESCE(workflow.released_at, disbursement.updated_at, disbursement.created_at),
    release_remarks = CASE
      WHEN COALESCE(workflow.release_remarks, '') LIKE 'SYSTEM_RECONCILIATION_REQUIRED:%'
        AND strpos(workflow.release_remarks, E'\n') > 0
        THEN NULLIF(btrim(substr(
          workflow.release_remarks,
          strpos(workflow.release_remarks, E'\n') + 1
        )), '')
      WHEN COALESCE(workflow.release_remarks, '') LIKE 'SYSTEM_RECONCILIATION_REQUIRED:%'
        THEN NULL
      ELSE workflow.release_remarks
    END,
    updated_at = now()
FROM public.loans loan
JOIN public.cash_disbursements disbursement
  ON disbursement.loan_id = loan.id
 AND disbursement.status = 'recorded'
JOIN public.journal_entries journal
  ON journal.id = disbursement.journal_entry_id
 AND journal.status = 'posted'
WHERE workflow.transaction_type = 'loan_disbursement'
  AND workflow.cash_release_required
  AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
  AND loan.id = workflow.source_record_id
  AND loan.id = NULLIF(workflow.approved_payload->>'loan_id', '')::UUID
  AND loan.status = 'active';

-- Reopen only when there is no linked or clearly matching legacy voucher.
-- Ambiguous or unposted legacy records remain blocked for Bookkeeper review.
UPDATE public.transaction_workflows workflow
SET status = 'awaiting_release',
    cash_release_status = 'awaiting_release',
    accounting_status = 'processing',
    business_record_table = NULL,
    business_record_id = NULL,
    journal_entry_id = NULL,
    treasurer_id = NULL,
    released_at = NULL,
    release_remarks = CASE
      WHEN COALESCE(workflow.release_remarks, '') LIKE 'SYSTEM_RECONCILIATION_REQUIRED:%'
        AND strpos(workflow.release_remarks, E'\n') > 0
        THEN NULLIF(btrim(substr(
          workflow.release_remarks,
          strpos(workflow.release_remarks, E'\n') + 1
        )), '')
      WHEN COALESCE(workflow.release_remarks, '') LIKE 'SYSTEM_RECONCILIATION_REQUIRED:%'
        THEN NULL
      ELSE workflow.release_remarks
    END,
    updated_at = now()
FROM public.loans loan
WHERE workflow.transaction_type = 'loan_disbursement'
  AND workflow.cash_release_required
  AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue', 'completed')
  AND loan.id = workflow.source_record_id
  AND loan.id = NULLIF(workflow.approved_payload->>'loan_id', '')::UUID
  AND loan.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.cash_disbursements disbursement
    WHERE disbursement.loan_id = loan.id
       OR (
         disbursement.loan_id IS NULL
         AND disbursement.member_id = loan.member_id
         AND disbursement.amount = loan.principal_amount
         AND disbursement.description = 'Loan release ' || loan.loan_number
       )
  );

DO $$
DECLARE
  v_signature REGPROCEDURE := 'public.confirm_transaction_workflow_release(uuid,uuid,text)'::REGPROCEDURE;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_old TEXT := $old$      IF v_loan_status = 'active' THEN
        RAISE EXCEPTION 'This loan is already active, but no recorded cash disbursement was found. Ask an administrator to reconcile it; do not attempt another release.';
      END IF;
      v_result := public.record_loan_disbursement(
        v_loan_id,
        p_workflow_id::TEXT,
        COALESCE(NULLIF(v_payload->>'release_date', '')::DATE, CURRENT_DATE),
        COALESCE(NULLIF(v_payload->>'payment_source', ''), 'cash-on-hand')
      );$old$;
  v_new TEXT := $new$      IF v_loan_status = 'active' THEN
        IF v_loan.member_id IS DISTINCT FROM v_workflow.member_id
           OR v_loan.principal_amount <> v_workflow.amount THEN
          RAISE EXCEPTION 'The active loan does not match the approved workflow amount or member';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM public.requests request
          WHERE request.id = v_loan.request_id
            AND request.request_type = 'loan_application'
            AND request.status = 'approved'
        ) THEN
          RAISE EXCEPTION 'The loan application is not approved';
        END IF;
        IF EXISTS (
          SELECT 1
          FROM public.cash_disbursements existing
          WHERE existing.loan_id = v_loan_id
             OR (
               existing.loan_id IS NULL
               AND existing.member_id = v_loan.member_id
               AND existing.amount = v_loan.principal_amount
               AND existing.description = 'Loan release ' || v_loan.loan_number
             )
        ) THEN
          RAISE EXCEPTION 'A matching loan disbursement already exists but is not linked to a verified posted release. The Bookkeeper must reconcile that record before another entry can be created.';
        END IF;

        SELECT trim(concat_ws(' ', member.first_name, member.middle_name, member.last_name))
        INTO v_member_name
        FROM public.members member
        WHERE member.id = v_loan.member_id;
        IF COALESCE(v_member_name, '') = '' THEN
          RAISE EXCEPTION 'The member linked to this loan could not be found';
        END IF;

        v_release_date := COALESCE(
          v_loan.release_date,
          NULLIF(v_payload->>'release_date', '')::DATE,
          CURRENT_DATE
        );
        v_result := public.save_cash_disbursement(
          jsonb_build_object(
            'workflow_id', p_workflow_id::TEXT,
            'disbursement_date', v_release_date,
            'payee', v_member_name,
            'member_id', v_loan.member_id,
            'amount', v_loan.principal_amount,
            'payment_source', COALESCE(NULLIF(v_payload->>'payment_source', ''), 'cash-on-hand'),
            'description', 'Loan release ' || v_loan.loan_number,
            'status', 'recorded'
          ),
          jsonb_build_array(
            jsonb_build_object('account', 'Loan Payable', 'amount', v_loan.principal_amount)
          )
        );
        UPDATE public.cash_disbursements
        SET loan_id = v_loan_id,
            member_id = v_loan.member_id
        WHERE id = NULLIF(v_result->>'disbursement_id', '')::UUID
          AND loan_id IS NULL;
      ELSE
        v_result := public.record_loan_disbursement(
          v_loan_id,
          p_workflow_id::TEXT,
          COALESCE(NULLIF(v_payload->>'release_date', '')::DATE, CURRENT_DATE),
          COALESCE(NULLIF(v_payload->>'payment_source', ''), 'cash-on-hand')
        );
      END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Required function % does not exist', v_signature;
  END IF;

  v_updated_definition := replace(v_definition, '  v_loan_status TEXT;', E'  v_loan_status TEXT;\n  v_loan public.loans%ROWTYPE;\n  v_member_name TEXT;\n  v_release_date DATE;');
  v_updated_definition := replace(
    v_updated_definition,
    $select$    SELECT status INTO v_loan_status
    FROM public.loans
    WHERE id = v_loan_id
    FOR UPDATE;$select$,
    $select$    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = v_loan_id
    FOR UPDATE;
    v_loan_status := v_loan.status;$select$
  );
  v_updated_definition := replace(v_updated_definition, v_old, v_new);

  IF v_updated_definition = v_definition
     OR position('v_loan public.loans%ROWTYPE;' IN v_updated_definition) = 0
     OR position('SELECT * INTO v_loan' IN v_updated_definition) = 0
     OR position('public.save_cash_disbursement(' IN v_updated_definition) = 0
     OR position(v_old IN v_updated_definition) > 0 THEN
    RAISE EXCEPTION 'Could not safely update the loan release confirmation function';
  END IF;

  EXECUTE v_updated_definition;
END;
$$;

COMMIT;

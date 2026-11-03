-- Link only unambiguous legacy loan releases that already have a posted
-- disbursement and journal entry. Flag all other active loans for review;
-- never create another cash disbursement automatically.

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
   AND disbursement.disbursement_date = loan.release_date
  JOIN public.journal_entries journal
    ON journal.id = disbursement.journal_entry_id
   AND journal.status = 'posted'
  WHERE disbursement.status = 'recorded'
    AND disbursement.loan_id IS NULL
    AND loan.status = 'active'
    AND loan.release_date IS NOT NULL
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
    release_remarks = NULLIF(
      btrim(replace(
        COALESCE(workflow.release_remarks, ''),
        'SYSTEM_RECONCILIATION_REQUIRED: Loan is active but no linked, posted cash disbursement was found. The Treasurer must confirm whether cash was handed to the member. The Bookkeeper must verify the voucher and posted journal entry. Do not retry the release until both checks are complete.',
        ''
      )),
      ''
    ),
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
  AND loan.status = 'active'
  AND loan.release_date IS NOT NULL;

UPDATE public.transaction_workflows workflow
SET status = 'release_issue',
    cash_release_status = 'release_issue',
    release_remarks = CASE
      WHEN COALESCE(workflow.release_remarks, '') LIKE 'SYSTEM_RECONCILIATION_REQUIRED:%'
        THEN workflow.release_remarks
      ELSE concat_ws(
        E'\n',
        'SYSTEM_RECONCILIATION_REQUIRED: Loan is active but no linked, posted cash disbursement was found. Verify the cash handoff and accounting records before taking any further action.',
        NULLIF(workflow.release_remarks, '')
      )
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
    JOIN public.journal_entries journal
      ON journal.id = disbursement.journal_entry_id
     AND journal.status = 'posted'
    WHERE disbursement.loan_id = loan.id
      AND disbursement.status = 'recorded'
  );

COMMIT;

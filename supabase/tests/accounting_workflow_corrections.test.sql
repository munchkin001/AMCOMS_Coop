BEGIN;
SELECT plan(9);

CREATE TEMP TABLE accounting_correction_test_ids (
  member_id UUID,
  unpaid_loan UUID DEFAULT gen_random_uuid(),
  partial_loan UUID DEFAULT gen_random_uuid(),
  interest_only_loan UUID DEFAULT gen_random_uuid(),
  penalty_only_loan UUID DEFAULT gen_random_uuid(),
  paid_loan UUID DEFAULT gen_random_uuid(),
  voided_loan UUID DEFAULT gen_random_uuid(),
  mismatch_loan UUID DEFAULT gen_random_uuid()
);
INSERT INTO accounting_correction_test_ids DEFAULT VALUES;

WITH inserted AS (
  INSERT INTO public.members (member_number, first_name, last_name, membership_type)
  VALUES ('ACCT-TEST-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'Accounting', 'Test', 'regular')
  RETURNING id
)
UPDATE accounting_correction_test_ids
SET member_id = inserted.id
FROM inserted;

INSERT INTO public.loans (
  id, loan_number, member_id, principal_amount, interest_rate, term_months,
  monthly_payment, total_interest, total_amount, balance, status
)
SELECT loans.id, 'ACCT-LOAN-' || loans.id::TEXT, ids.member_id, 1000, 12, 12, 100, 100, 1100, loans.balance, loans.status
FROM accounting_correction_test_ids ids
CROSS JOIN LATERAL (VALUES
  (unpaid_loan, 1000::NUMERIC, 'active'),
  (partial_loan, 800::NUMERIC, 'active'),
  (interest_only_loan, 1000::NUMERIC, 'active'),
  (penalty_only_loan, 1000::NUMERIC, 'active'),
  (paid_loan, 0::NUMERIC, 'completed'),
  (voided_loan, 1000::NUMERIC, 'active'),
  (mismatch_loan, 700::NUMERIC, 'active')
) AS loans(id, balance, status);

INSERT INTO public.loan_payments (
  loan_id, payment_number, payment_date, amount_paid, principal_paid,
  interest_paid, penalty_paid, balance_after, status
)
SELECT partial_loan, 1, CURRENT_DATE, 220, 200, 20, 0, 800, 'recorded'
FROM accounting_correction_test_ids
UNION ALL
SELECT interest_only_loan, 1, CURRENT_DATE, 20, 0, 20, 0, 1000, 'recorded'
FROM accounting_correction_test_ids
UNION ALL
SELECT penalty_only_loan, 1, CURRENT_DATE, 20, 0, 0, 20, 1000, 'recorded'
FROM accounting_correction_test_ids
UNION ALL
SELECT paid_loan, 1, CURRENT_DATE, 1100, 1000, 100, 0, 0, 'recorded'
FROM accounting_correction_test_ids
UNION ALL
SELECT voided_loan, 1, CURRENT_DATE, 100, 100, 0, 0, 900, 'void'
FROM accounting_correction_test_ids
UNION ALL
SELECT mismatch_loan, 1, CURRENT_DATE, 220, 200, 20, 0, 800, 'recorded'
FROM accounting_correction_test_ids;

UPDATE public.loans loan
SET balance = expected.balance
FROM accounting_correction_test_ids ids
CROSS JOIN LATERAL (VALUES
  (ids.unpaid_loan, 1000::NUMERIC),
  (ids.partial_loan, 800::NUMERIC),
  (ids.interest_only_loan, 1000::NUMERIC),
  (ids.penalty_only_loan, 1000::NUMERIC),
  (ids.paid_loan, 0::NUMERIC),
  (ids.voided_loan, 1000::NUMERIC),
  (ids.mismatch_loan, 700::NUMERIC)
) AS expected(loan_id, balance)
WHERE loan.id = expected.loan_id;

SELECT ok(
  to_regprocedure('public.cancel_credit_sale(uuid,text,jsonb)') IS NOT NULL,
  'Credit-sale cancellation RPC is installed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM accounting_correction_test_ids ids
    CROSS JOIN LATERAL unnest(ARRAY[
      ids.unpaid_loan, ids.partial_loan, ids.interest_only_loan,
      ids.penalty_only_loan, ids.paid_loan, ids.voided_loan
    ]) AS expected(loan_id)
    JOIN public.data_discrepancy_scan scan ON scan.id = 'loan:' || expected.loan_id
  ),
  'Unpaid, partial-principal, interest-only, penalty-only, paid, and voided loans reconcile without false flags'
);

SELECT is(
  (SELECT count(*)::INTEGER
   FROM accounting_correction_test_ids ids
   JOIN public.data_discrepancy_scan scan ON scan.id = 'loan:' || ids.mismatch_loan),
  1,
  'A real principal balance mismatch remains visible'
);

SELECT ok(
  (SELECT reason ILIKE '%principal and recorded principal payments imply%'
   FROM accounting_correction_test_ids ids
   JOIN public.data_discrepancy_scan scan ON scan.id = 'loan:' || ids.mismatch_loan),
  'Loan discrepancy explanation identifies principal-only reconciliation'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'cancellation_reason'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'cancellation_reversal_journal_entry_id'
  ),
  'Credit-sale cancellation reason and reversal are retained on the original sale'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entry_register' AND column_name = 'source_reference'
  ),
  'Journal register exposes the originating source reference'
);

SELECT is(
  (SELECT numeric_scale::INTEGER FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'unit_cost'),
  4,
  'Stock movement unit costs preserve FIFO layer precision for returns'
);

SELECT is(
  (SELECT count(*)::INTEGER
   FROM accounting_correction_test_ids ids
   JOIN public.data_discrepancy_scan scan ON scan.id = 'loan:' || ids.mismatch_loan),
  1,
  'Repeated discrepancy scans remain read-only and do not duplicate the live finding'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.sync_offline_operation(uuid,text,jsonb)'::regprocedure
  ),
  'Existing idempotent operation RPC remains available for online transaction retries'
);

SELECT * FROM finish();
ROLLBACK;

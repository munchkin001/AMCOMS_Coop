BEGIN;
SELECT plan(3);

SELECT ok(
  to_regprocedure('public.review_loan_request(uuid,text,text)') IS NOT NULL,
  'Manager approval RPC is installed'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.requests'::regclass
      AND tgname = 'create_loan_on_request_approval'
      AND NOT tgisinternal
  ),
  'Approving a loan request triggers creation of its approved loan'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'loans'
      AND policyname = 'Bookkeeper can view all loans'
      AND cmd = 'SELECT'
  ),
  'Bookkeepers can see approved loans awaiting cash release'
);

SELECT * FROM finish();
ROLLBACK;

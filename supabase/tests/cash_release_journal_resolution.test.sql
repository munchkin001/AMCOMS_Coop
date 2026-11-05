BEGIN;
SELECT plan(1);

SELECT ok(
  position(
    'SELECT disbursement.journal_entry_id'
    IN pg_get_functiondef('public.confirm_transaction_workflow_release(uuid,uuid,text)'::REGPROCEDURE)
  ) > 0,
  'Cash release resolves the journal entry from a posted disbursement when the processor omits it'
);

SELECT * FROM finish();
ROLLBACK;

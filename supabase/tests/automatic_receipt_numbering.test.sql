BEGIN;
SELECT plan(5);

SELECT ok(
  to_regprocedure('public.next_cooperative_receipt_number()') IS NOT NULL,
  'Server-side receipt number generator is installed'
);

CREATE TEMP TABLE receipt_numbering_test (
  first_receipt TEXT,
  second_receipt TEXT
);

INSERT INTO receipt_numbering_test (first_receipt)
SELECT public.next_cooperative_receipt_number();

UPDATE receipt_numbering_test
SET second_receipt = public.next_cooperative_receipt_number();

SELECT ok(
  first_receipt LIKE 'AMCOMS-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila', 'YYYY') || '-%',
  'Receipt number uses the current cooperative calendar year'
)
FROM receipt_numbering_test;

SELECT ok(
  (
    split_part(second_receipt, '-', 2) = split_part(first_receipt, '-', 2)
    AND split_part(second_receipt, '-', 3)::BIGINT = split_part(first_receipt, '-', 3)::BIGINT + 1
  ) OR (
    split_part(second_receipt, '-', 2)::INTEGER = split_part(first_receipt, '-', 2)::INTEGER + 1
    AND split_part(second_receipt, '-', 3)::BIGINT = 1
  ),
  'Sequential calls receive distinct consecutive numbers'
)
FROM receipt_numbering_test;

INSERT INTO public.cash_receipts (
  receipt_number, receipt_date, received_from, amount, payment_method,
  description, issued_at
)
SELECT first_receipt, CURRENT_DATE, 'Receipt numbering test', 1, 'cash',
       'Receipt numbering immutability test', clock_timestamp()
FROM receipt_numbering_test;

SELECT throws_ok(
  $$UPDATE public.cash_receipts
    SET receipt_number = 'AMCOMS-2099-999999'
    WHERE receipt_number = (SELECT first_receipt FROM receipt_numbering_test)$$,
  'P0001',
  'An issued receipt number and its issuance details cannot be changed.',
  'Issued receipt numbers cannot be edited'
);

SELECT is(
  (SELECT receipt_number FROM public.cash_receipts
   WHERE receipt_number = (SELECT first_receipt FROM receipt_numbering_test)),
  (SELECT first_receipt FROM receipt_numbering_test),
  'A rejected number change leaves the original receipt intact'
);

SELECT * FROM finish();
ROLLBACK;

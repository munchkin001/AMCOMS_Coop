BEGIN;

UPDATE public.sales_orders
SET due_date = NULL
WHERE payment_status IN ('pending', 'partial')
  AND due_date = order_date
  AND created_at < TIMESTAMPTZ '2026-11-03 00:00:00+08';

COMMIT;

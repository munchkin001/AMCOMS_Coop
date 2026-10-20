BEGIN;

ALTER TABLE public.inventory_cost_layers
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();

COMMENT ON COLUMN public.inventory_cost_layers.created_at IS
  'Precise layer creation timestamp used to break FIFO ties between inventory received on the same date.';

COMMIT;

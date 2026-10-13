BEGIN;
SELECT plan(13);

CREATE TEMP TABLE fifo_test_ids (
  valued_product UUID,
  unvalued_product UUID,
  sale_order UUID,
  production_product UUID
);
INSERT INTO fifo_test_ids DEFAULT VALUES;

WITH inserted AS (
  INSERT INTO public.products (product_code, product_name, unit_of_measure, unit_price, cost_price)
  VALUES ('FIFO-TEST-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'FIFO test product', 'piece', 20, 0)
  RETURNING id
)
UPDATE fifo_test_ids SET valued_product = inserted.id FROM inserted;

WITH inserted AS (
  INSERT INTO public.products (product_code, product_name, unit_of_measure, unit_price, cost_price)
  VALUES ('FIFO-TEST-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'FIFO unvalued test product', 'piece', 20, 0)
  RETURNING id
)
UPDATE fifo_test_ids SET unvalued_product = inserted.id FROM inserted;

WITH inserted AS (
  INSERT INTO public.products (product_code, product_name, unit_of_measure, unit_price, cost_price)
  VALUES ('FIFO-TEST-' || upper(substr(gen_random_uuid()::TEXT, 1, 8)), 'FIFO production test product', 'piece', 20, 0)
  RETURNING id
)
UPDATE fifo_test_ids SET production_product = inserted.id FROM inserted;

INSERT INTO public.stock_inventory (product_id, quantity_on_hand)
SELECT unvalued_product, 2 FROM fifo_test_ids;
INSERT INTO public.stock_inventory (product_id, quantity_on_hand)
SELECT valued_product, 0 FROM fifo_test_ids;
INSERT INTO public.stock_inventory (product_id, quantity_on_hand)
SELECT production_product, 0 FROM fifo_test_ids;

INSERT INTO public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_number, movement_date, description)
SELECT valued_product, 'purchase', 5, 10, 'FIFO-LOT-1', CURRENT_DATE, 'FIFO test first cost layer' FROM fifo_test_ids;
INSERT INTO public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_number, movement_date, description)
SELECT valued_product, 'purchase', 3, 20, 'FIFO-LOT-2', CURRENT_DATE, 'FIFO test second cost layer' FROM fifo_test_ids;
INSERT INTO public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_number, movement_date, description)
SELECT production_product, 'production', 3, 15, 'FIFO-PR-TEST', CURRENT_DATE, 'FIFO test production layer' FROM fifo_test_ids;

UPDATE public.stock_inventory si
SET quantity_on_hand = 8
FROM fifo_test_ids ids
WHERE si.product_id = ids.valued_product;

WITH inserted AS (
  INSERT INTO public.sales_orders (order_number, customer_name, total_amount, net_amount)
  VALUES ('FIFO-SALE-TEST', 'FIFO Test Customer', 120, 120)
  RETURNING id
)
UPDATE fifo_test_ids SET sale_order = inserted.id FROM inserted;

INSERT INTO public.sales_order_items (sales_order_id, product_id, item_description, quantity, unit_price, line_total)
SELECT sale_order, valued_product, 'FIFO test product', 6, 20, 120 FROM fifo_test_ids;

UPDATE public.stock_inventory si
SET quantity_on_hand = 2
FROM fifo_test_ids ids
WHERE si.product_id = ids.valued_product;

INSERT INTO public.stock_movements (product_id, movement_type, quantity, reference_number, movement_date, description)
SELECT valued_product, 'sale', 6, 'FIFO-SALE-TEST', CURRENT_DATE, 'FIFO test sale' FROM fifo_test_ids;

SELECT is(
  (SELECT quantity_remaining FROM public.inventory_cost_layers l JOIN fifo_test_ids i ON l.product_id = i.valued_product WHERE l.unit_cost = 10),
  0,
  'FIFO consumes the oldest layer first'
);
SELECT is(
  (SELECT quantity_remaining FROM public.inventory_cost_layers l JOIN fifo_test_ids i ON l.product_id = i.valued_product WHERE l.unit_cost = 20),
  2,
  'FIFO leaves the unconsumed newer layer balance'
);
SELECT is(
  (SELECT unit_cost FROM public.stock_movements WHERE reference_number = 'FIFO-SALE-TEST'),
  11.67::NUMERIC,
  'Sale movement records the weighted unit cost of FIFO allocations'
);
SELECT is(
  (SELECT total_cost FROM public.stock_movements WHERE reference_number = 'FIFO-SALE-TEST'),
  70::NUMERIC,
  'Sale movement retains exact total FIFO cost'
);
SELECT is(
  (SELECT sum(total_cost) FROM public.inventory_cost_allocations a JOIN fifo_test_ids i ON a.stock_movement_id IN (
    SELECT id FROM public.stock_movements WHERE reference_number = 'FIFO-SALE-TEST' AND product_id = i.valued_product
  )),
  70::NUMERIC,
  'FIFO allocation total reflects five units at 10 and one at 20'
);
SELECT is(
  (SELECT sum(debit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id WHERE e.entry_number = 'COGS-FIFO-SALE-TEST'),
  70::NUMERIC,
  'Sale posts the FIFO cost to Cost of Goods Sold'
);
SELECT is(
  (SELECT sum(credit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id WHERE e.entry_number = 'COGS-FIFO-SALE-TEST'),
  70::NUMERIC,
  'Sale credits inventory for the same FIFO cost'
);
SELECT is(
  (SELECT sum(l.debit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id JOIN public.chart_of_accounts a ON a.id = l.account_id WHERE e.reference_number = 'FIFO-LOT-1' AND a.account_name = 'Inventory'),
  50::NUMERIC,
  'Supplier receipt debits inventory'
);
SELECT is(
  (SELECT sum(l.credit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id JOIN public.chart_of_accounts a ON a.id = l.account_id WHERE e.reference_number = 'FIFO-LOT-1' AND a.account_name = 'Account Payable'),
  50::NUMERIC,
  'Supplier receipt creates an accounts-payable liability'
);
SELECT is(
  (SELECT sum(l.debit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id JOIN public.chart_of_accounts a ON a.id = l.account_id WHERE e.reference_number = 'FIFO-PR-TEST' AND a.account_name = 'Inventory'),
  45::NUMERIC,
  'Production output debits finished inventory'
);
SELECT is(
  (SELECT sum(l.credit_amount) FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id JOIN public.chart_of_accounts a ON a.id = l.account_id WHERE e.reference_number = 'FIFO-PR-TEST' AND a.account_name = 'Work in Process Inventory'),
  45::NUMERIC,
  'Production output credits work in process'
);
SELECT throws_ok(
  $$INSERT INTO public.sales_order_items (sales_order_id, product_id, item_description, quantity, unit_price, line_total)
    SELECT gen_random_uuid(), unvalued_product, 'Unvalued product', 1, 20, 20 FROM fifo_test_ids$$,
  'P0001',
  'Value all existing stock for this product with verified opening FIFO costs before selling it',
  'Sales are blocked until all on-hand stock has verified FIFO costs'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('stock_inventory', 'stock_movements', 'production_records', 'sales_orders', 'sales_order_items')
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'Inventory and sale mutations are restricted to the atomic database workflows'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;

CREATE OR REPLACE VIEW public.data_discrepancy_scan
WITH (security_invoker = true) AS
SELECT 'loan:' || l.id AS id, l.member_id, 'Loan balance' AS category,
       'Loan ' || l.loan_number || ' shows a balance of ' || to_char(l.balance, 'FM999,999,990.00')
         || ' but its principal and recorded principal payments imply '
         || to_char(GREATEST(l.principal_amount - COALESCE(p.principal_paid, 0), 0), 'FM999,999,990.00') || '.' AS reason,
       l.loan_number AS reference, l.created_at AS detected_at
FROM public.loans l
LEFT JOIN (
  SELECT loan_id, SUM(principal_paid) AS principal_paid
  FROM public.loan_payments
  WHERE status = 'recorded'
  GROUP BY loan_id
) p ON p.loan_id = l.id
WHERE l.status IN ('active', 'completed')
  AND abs(l.balance - GREATEST(l.principal_amount - COALESCE(p.principal_paid, 0), 0)) > 0.01
UNION ALL
SELECT 'loanmember:' || l.id, l.member_id, 'Loan status',
       'Loan ' || l.loan_number || ' is active but the member is not an active member.',
       l.loan_number, l.created_at
FROM public.loans l
JOIN public.members m ON m.id = l.member_id
WHERE l.status = 'active' AND (m.membership_status <> 'active' OR m.archived_at IS NOT NULL)
UNION ALL
SELECT 'savings:' || s.id, s.member_id, 'Savings balance',
       'Account ' || s.account_number || ' shows ' || to_char(s.balance, 'FM999,999,990.00')
         || ' but its transactions total ' || to_char(COALESCE(t.net, 0), 'FM999,999,990.00') || '.',
       s.account_number, s.created_at
FROM public.savings_accounts s
LEFT JOIN (
  SELECT savings_account_id,
         SUM(CASE WHEN transaction_type = 'withdrawal' THEN -amount ELSE amount END) AS net
  FROM public.savings_transactions
  WHERE status = 'recorded'
  GROUP BY savings_account_id
) t ON t.savings_account_id = s.id
WHERE s.status = 'active' AND abs(s.balance - COALESCE(t.net, 0)) > 0.01
UNION ALL
SELECT 'stock:' || i.id, NULL, 'Inventory',
       'Stock for ' || pr.product_name || ' is negative (' || i.quantity_on_hand || ').',
       pr.product_code, i.updated_at
FROM public.stock_inventory i
JOIN public.products pr ON pr.id = i.product_id
WHERE i.quantity_on_hand < 0
UNION ALL
SELECT 'journal:' || j.id, NULL, 'Journal entry',
       'Posted entry ' || j.entry_number || ' is unbalanced (debits ' || to_char(x.d, 'FM999,999,990.00')
         || ', credits ' || to_char(x.c, 'FM999,999,990.00') || ').',
       j.entry_number, j.created_at
FROM public.journal_entries j
JOIN (
  SELECT journal_entry_id, SUM(debit_amount) AS d, SUM(credit_amount) AS c
  FROM public.journal_entry_lines GROUP BY journal_entry_id
) x ON x.journal_entry_id = j.id
WHERE j.status = 'posted' AND abs(x.d - x.c) > 0.01;

COMMENT ON VIEW public.data_discrepancy_scan IS
  'Live discrepancy scan. Loan balances are reconciled against principal-only payments; interest and penalties do not reduce principal.';

ALTER TABLE public.stock_movements
  ALTER COLUMN unit_cost TYPE NUMERIC(15, 4)
  USING unit_cost::NUMERIC(15, 4);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reversal_journal_entry_id UUID REFERENCES public.journal_entries(id);

CREATE OR REPLACE FUNCTION public.cancel_credit_sale(
  p_sales_order_id UUID,
  p_reason TEXT,
  p_returned_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_order public.sales_orders%ROWTYPE;
  v_sale_entry public.journal_entries%ROWTYPE;
  v_reversal_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_sold_quantity INTEGER;
  v_previously_returned INTEGER;
  v_remaining_to_return INTEGER;
  v_available_cost_quantity INTEGER;
  v_take INTEGER;
  v_cost RECORD;
  v_inventory_id UUID;
  v_return_movement_id UUID;
  v_reason TEXT := trim(COALESCE(p_reason, ''));
  v_order_number TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_any_role(ARRAY['bookkeeper', 'manager']) THEN
    RAISE EXCEPTION 'Only active Bookkeeper or Manager staff can cancel a credit sale';
  END IF;
  IF p_sales_order_id IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Select a sale and enter a cancellation reason';
  END IF;
  IF p_returned_items IS NULL OR jsonb_typeof(p_returned_items) <> 'array' THEN
    RAISE EXCEPTION 'Returned quantities must be supplied as an array';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected sale does not exist';
  END IF;
  IF v_order.cancelled_at IS NOT NULL THEN
    IF v_order.cancellation_reversal_journal_entry_id IS NULL THEN
      RAISE EXCEPTION 'This sale has cancellation metadata but no linked reversal; reconcile it before retrying';
    END IF;
    RETURN jsonb_build_object(
      'cancelled', true,
      'already_cancelled', true,
      'sales_order_id', v_order.id,
      'reversal_journal_entry_id', v_order.cancellation_reversal_journal_entry_id
    );
  END IF;
  IF v_order.cash_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cash sales cannot be cancelled here; void or refund the receipt through the cash receipt workflow';
  END IF;
  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'This sale is already cancelled and has no credit-sale cancellation audit record';
  END IF;
  v_order_number := trim(v_order.order_number);
  IF EXISTS (
    SELECT 1
    FROM public.cash_receipts receipt
    WHERE receipt.status = 'recorded'
      AND (
        EXISTS (
          SELECT 1
          FROM public.cash_receipt_sales_collections collection
          WHERE collection.receipt_id = receipt.id
            AND collection.sales_order_id = v_order.id
        )
        OR receipt.description = 'Collection for sale ' || v_order_number
      )
  ) THEN
    RAISE EXCEPTION 'Void or refund all collection receipts separately before cancelling this sale';
  END IF;
  IF COALESCE(v_order.amount_paid, 0) > 0.01 THEN
    RAISE EXCEPTION 'Void or refund all collection receipts separately before cancelling this sale';
  END IF;

  SELECT * INTO v_sale_entry
  FROM public.journal_entries
  WHERE entry_number = 'SALE-' || v_order_number
  FOR UPDATE;
  IF NOT FOUND OR v_sale_entry.status <> 'posted' OR v_sale_entry.reverses_entry_id IS NOT NULL
     OR v_sale_entry.reversed_by_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'The posted credit-sale journal entry is missing or already reversed';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_returned_items)
  LOOP
    IF COALESCE(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(v_item->>'quantity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Each returned item needs a valid product ID and whole-number quantity';
    END IF;
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    IF v_quantity = 0 THEN
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('stock:' || v_product_id::TEXT));
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold_quantity
    FROM public.stock_movements
    WHERE movement_type = 'sale'
      AND reference_number = v_order_number
      AND product_id = v_product_id;
    SELECT COALESCE(SUM(quantity), 0) INTO v_previously_returned
    FROM public.stock_movements
    WHERE movement_type = 'return'
      AND reference_number = v_order_number
      AND product_id = v_product_id;
    IF v_sold_quantity = 0 OR v_quantity > v_sold_quantity - v_previously_returned THEN
      RAISE EXCEPTION 'Returned quantity exceeds the remaining quantity sold for product %', v_product_id;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements returned
      WHERE returned.movement_type = 'return'
        AND returned.reference_number = v_order_number
        AND returned.product_id = v_product_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.stock_movements sold
          JOIN public.inventory_cost_allocations allocation ON allocation.stock_movement_id = sold.id
          WHERE sold.movement_type = 'sale'
            AND sold.reference_number = v_order_number
            AND sold.product_id = v_product_id
            AND round(allocation.unit_cost, 4) = round(returned.unit_cost, 4)
        )
    ) THEN
      RAISE EXCEPTION 'Existing return costs for product % need reconciliation before cancellation', v_product_id;
    END IF;

    SELECT id INTO v_inventory_id
    FROM public.stock_inventory
    WHERE product_id = v_product_id
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;
    IF v_inventory_id IS NULL THEN
      INSERT INTO public.stock_inventory (product_id, quantity_on_hand, last_restock_date)
      VALUES (v_product_id, 0, CURRENT_DATE)
      RETURNING id INTO v_inventory_id;
    END IF;
    UPDATE public.stock_inventory
    SET quantity_on_hand = quantity_on_hand + v_quantity,
        last_restock_date = CURRENT_DATE,
        updated_at = now()
    WHERE id = v_inventory_id;

    v_remaining_to_return := v_quantity;
    FOR v_cost IN
      SELECT a.unit_cost,
             SUM(a.quantity)::INTEGER AS sold_at_cost,
             COALESCE((
               SELECT SUM(r.quantity)
               FROM public.stock_movements r
               WHERE r.movement_type = 'return'
                 AND r.reference_number = v_order_number
                 AND r.product_id = v_product_id
                 AND round(r.unit_cost, 4) = round(a.unit_cost, 4)
             ), 0)::INTEGER AS previously_returned_at_cost
      FROM public.stock_movements sold
      JOIN public.inventory_cost_allocations a ON a.stock_movement_id = sold.id
      WHERE sold.movement_type = 'sale'
        AND sold.reference_number = v_order_number
        AND sold.product_id = v_product_id
      GROUP BY a.unit_cost
      ORDER BY min(a.created_at), a.unit_cost
    LOOP
      v_available_cost_quantity := v_cost.sold_at_cost - v_cost.previously_returned_at_cost;
      IF v_available_cost_quantity < 0 THEN
        RAISE EXCEPTION 'Existing return cost allocations for product % need reconciliation before cancellation', v_product_id;
      END IF;
      v_take := LEAST(v_remaining_to_return, v_available_cost_quantity);
      IF v_take > 0 THEN
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity, unit_cost, reference_number,
          movement_date, description, created_by
        ) VALUES (
          v_product_id, 'return', v_take, v_cost.unit_cost, v_order_number,
          CURRENT_DATE, 'Returned goods for cancelled credit sale: ' || v_reason, v_staff_id
        ) RETURNING id INTO v_return_movement_id;
        v_remaining_to_return := v_remaining_to_return - v_take;
      END IF;
      EXIT WHEN v_remaining_to_return = 0;
    END LOOP;
    IF v_remaining_to_return > 0 THEN
      RAISE EXCEPTION 'FIFO cost records do not cover the confirmed return quantity for product %', v_product_id;
    END IF;
  END LOOP;

  v_reversal_id := public._reverse_journal_entry(v_sale_entry.id, v_reason, v_staff_id);
  UPDATE public.sales_orders
  SET order_status = 'cancelled',
      payment_status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by = v_staff_id,
      cancellation_reason = v_reason,
      cancellation_reversal_journal_entry_id = v_reversal_id
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'cancelled', true,
    'already_cancelled', false,
    'sales_order_id', v_order.id,
    'order_number', v_order_number,
    'reversal_journal_entry_id', v_reversal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_credit_sale(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_credit_sale(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE VIEW public.journal_entry_register
WITH (security_invoker = true) AS
SELECT
  je.id, je.entry_number, je.entry_date, je.description, je.reference_number, je.entry_type, je.status,
  je.created_at, je.posted_at, je.reversed_at, je.reversal_reason,
  je.reverses_entry_id, je.reversed_by_entry_id,
  (SELECT COALESCE(SUM(l.debit_amount), 0) FROM public.journal_entry_lines l WHERE l.journal_entry_id = je.id) AS total_debit,
  (SELECT COALESCE(SUM(l.credit_amount), 0) FROM public.journal_entry_lines l WHERE l.journal_entry_id = je.id) AS total_credit,
  public.staff_display_name(je.created_by) AS created_by_name,
  public.staff_display_name(je.posted_by) AS posted_by_name,
  public.staff_display_name(je.reversed_by) AS reversed_by_name,
  CASE
    WHEN je.reverses_entry_id IS NOT NULL THEN 'Reversal'
    WHEN EXISTS (
      SELECT 1 FROM public.sales_orders so
      WHERE so.cash_receipt_id IN (SELECT r.id FROM public.cash_receipts r WHERE r.journal_entry_id = je.id)
    ) THEN 'Cash Sale'
    WHEN EXISTS (SELECT 1 FROM public.sales_orders so WHERE je.entry_number = 'SALE-' || so.order_number) THEN 'Credit Sale'
    WHEN EXISTS (
      SELECT 1
      FROM public.cash_receipts r
      JOIN public.sales_orders so
        ON r.description = 'Collection for sale ' || so.order_number
      WHERE r.journal_entry_id = je.id
    ) THEN 'Sale Collection'
    WHEN EXISTS (SELECT 1 FROM public.cash_receipts r WHERE r.journal_entry_id = je.id) THEN 'Cash Receipt'
    WHEN EXISTS (SELECT 1 FROM public.cash_disbursements d WHERE d.journal_entry_id = je.id) THEN 'Cash Disbursement'
    WHEN je.entry_number LIKE 'COGS-%' OR je.entry_number LIKE 'INVRETURN-%' THEN 'Inventory Cost'
    ELSE 'Manual Entry'
  END AS source_type,
  COALESCE(
    (SELECT so.order_number FROM public.sales_orders so
      WHERE so.cash_receipt_id IN (SELECT r.id FROM public.cash_receipts r WHERE r.journal_entry_id = je.id)
      LIMIT 1),
    (SELECT so.order_number FROM public.sales_orders so WHERE je.entry_number = 'SALE-' || so.order_number LIMIT 1),
    (SELECT so.order_number
      FROM public.cash_receipts r
      JOIN public.sales_orders so
        ON r.description = 'Collection for sale ' || so.order_number
      WHERE r.journal_entry_id = je.id
      LIMIT 1),
    (SELECT original.reference_number FROM public.journal_entries original WHERE original.id = je.reverses_entry_id),
    je.reference_number
  ) AS source_reference
FROM public.journal_entries je;

GRANT SELECT ON public.journal_entry_register TO authenticated;

COMMIT;

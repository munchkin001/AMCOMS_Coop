BEGIN;

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
  v_journal_id UUID;
  v_journal_number TEXT;
  v_receivable_account_id UUID;
  v_revenue_account_id UUID;
  v_debit_total NUMERIC(15, 2);
  v_credit_total NUMERIC(15, 2);
  v_returned_value NUMERIC(15, 2) := 0;
  v_adjustment_amount NUMERIC(15, 2);
  v_line_value NUMERIC(15, 2);
  v_line_quantity INTEGER;
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
  v_has_returned_items BOOLEAN := false;
  v_has_prior_returns BOOLEAN := false;
  v_fully_cancelled BOOLEAN;
  v_reason TEXT := trim(COALESCE(p_reason, ''));
  v_order_number TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_any_role(ARRAY['bookkeeper', 'manager']) THEN
    RAISE EXCEPTION 'Only active Bookkeeper or Manager staff can return a credit sale';
  END IF;
  IF p_sales_order_id IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Select a sale and enter a return reason';
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
      RAISE EXCEPTION 'This sale has cancellation metadata but no linked journal entry; reconcile it before retrying';
    END IF;
    RETURN jsonb_build_object(
      'cancelled', true,
      'already_cancelled', true,
      'sales_order_id', v_order.id,
      'journal_entry_id', v_order.cancellation_reversal_journal_entry_id,
      'reversal_journal_entry_id', v_order.cancellation_reversal_journal_entry_id
    );
  END IF;
  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'This sale is already cancelled';
  END IF;
  IF v_order.cash_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cash sales cannot be returned here; void or refund the receipt through the cash receipt workflow';
  END IF;
  IF COALESCE(v_order.amount_paid, 0) > 0 THEN
    RAISE EXCEPTION 'Void or refund all collection receipts separately before returning this sale';
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
    RAISE EXCEPTION 'Void or refund all collection receipts separately before returning this sale';
  END IF;

  SELECT * INTO v_sale_entry
  FROM public.journal_entries
  WHERE entry_number = 'SALE-' || v_order_number
  FOR UPDATE;
  IF NOT FOUND OR v_sale_entry.status <> 'posted' OR v_sale_entry.reverses_entry_id IS NOT NULL
     OR v_sale_entry.reversed_by_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'The posted credit-sale journal entry is missing or already reversed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE movement_type = 'return'
      AND reference_number = v_order_number
  ) INTO v_has_prior_returns;

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

    SELECT COALESCE(SUM(line_total), 0), COALESCE(SUM(quantity), 0)::INTEGER
    INTO v_line_value, v_line_quantity
    FROM public.sales_order_items
    WHERE sales_order_id = v_order.id
      AND product_id = v_product_id;
    IF v_line_quantity = 0 THEN
      RAISE EXCEPTION 'Product % is not part of this sale', v_product_id;
    END IF;
    v_returned_value := v_returned_value
      + round(v_line_value * v_quantity / v_line_quantity, 2);
    v_has_returned_items := true;

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
      RAISE EXCEPTION 'Existing return costs for product % need reconciliation before return', v_product_id;
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
        RAISE EXCEPTION 'Existing return cost allocations for product % need reconciliation before return', v_product_id;
      END IF;
      v_take := LEAST(v_remaining_to_return, v_available_cost_quantity);
      IF v_take > 0 THEN
        INSERT INTO public.stock_movements (
          product_id, movement_type, quantity, unit_cost, reference_number,
          movement_date, description, created_by
        ) VALUES (
          v_product_id, 'return', v_take, v_cost.unit_cost, v_order_number,
          CURRENT_DATE, 'Returned goods for credit sale: ' || v_reason, v_staff_id
        ) RETURNING id INTO v_return_movement_id;
        v_remaining_to_return := v_remaining_to_return - v_take;
      END IF;
      EXIT WHEN v_remaining_to_return = 0;
    END LOOP;
    IF v_remaining_to_return > 0 THEN
      RAISE EXCEPTION 'FIFO cost records do not cover the confirmed return quantity for product %', v_product_id;
    END IF;
  END LOOP;

  IF v_has_returned_items AND v_returned_value <= 0 THEN
    RAISE EXCEPTION 'Returned items must have a positive sale value';
  END IF;
  IF v_has_returned_items AND v_returned_value > v_order.net_amount THEN
    RAISE EXCEPTION 'The returned items value exceeds the remaining credit balance';
  END IF;

  v_adjustment_amount := CASE
    WHEN v_has_returned_items THEN v_returned_value
    ELSE v_order.net_amount
  END;
  v_fully_cancelled := NOT v_has_returned_items
    OR v_adjustment_amount >= v_order.net_amount;

  IF NOT v_has_returned_items AND NOT v_has_prior_returns THEN
    v_journal_id := public._reverse_journal_entry(v_sale_entry.id, v_reason, v_staff_id);
  ELSE
    SELECT
      COALESCE(SUM(debit_amount), 0),
      COALESCE(SUM(credit_amount), 0)
    INTO v_debit_total, v_credit_total
    FROM public.journal_entry_lines
    WHERE journal_entry_id = v_sale_entry.id;
    IF v_debit_total <> v_credit_total OR v_debit_total < v_order.net_amount THEN
      RAISE EXCEPTION 'The original sale journal does not match the remaining sale record; reconcile it before returning';
    END IF;

    SELECT account_id INTO v_receivable_account_id
    FROM public.journal_entry_lines
    WHERE journal_entry_id = v_sale_entry.id AND debit_amount > 0
    ORDER BY id
    LIMIT 1;
    SELECT account_id INTO v_revenue_account_id
    FROM public.journal_entry_lines
    WHERE journal_entry_id = v_sale_entry.id AND credit_amount > 0
    ORDER BY id
    LIMIT 1;
    IF v_receivable_account_id IS NULL OR v_revenue_account_id IS NULL THEN
      RAISE EXCEPTION 'The original sale journal is missing receivable or revenue accounts';
    END IF;

    v_journal_number := 'AJE-' ||
      to_char((now() AT TIME ZONE 'Asia/Manila')::DATE, 'YYYY') ||
      '-' || lpad(nextval('public.journal_entry_seq')::TEXT, 5, '0');
    INSERT INTO public.journal_entries (
      entry_number, entry_date, description, reference_number, entry_type, status,
      created_by, posted_by, posted_at
    ) VALUES (
      v_journal_number,
      (now() AT TIME ZONE 'Asia/Manila')::DATE,
      'Credit sale return ' || v_order_number || ': ' || v_reason,
      v_order_number, 'adjusting', 'posted', v_staff_id, v_staff_id, now()
    ) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES
      (v_journal_id, v_revenue_account_id, v_adjustment_amount, 0, 'Returned items for sale ' || v_order_number),
      (v_journal_id, v_receivable_account_id, 0, v_adjustment_amount, 'Reduce receivable for sale ' || v_order_number);
  END IF;

  IF v_fully_cancelled THEN
    UPDATE public.sales_orders
    SET total_amount = 0,
        net_amount = 0,
        payment_status = 'cancelled',
        order_status = 'cancelled',
        cancelled_at = clock_timestamp(),
        cancelled_by = v_staff_id,
        cancellation_reason = v_reason,
        cancellation_reversal_journal_entry_id = v_journal_id
    WHERE id = v_order.id;
  ELSE
    UPDATE public.sales_orders
    SET total_amount = greatest(round(total_amount - v_adjustment_amount, 2), 0),
        net_amount = greatest(round(net_amount - v_adjustment_amount, 2), 0),
        payment_status = CASE
          WHEN amount_paid >= greatest(round(net_amount - v_adjustment_amount, 2), 0) THEN 'paid'
          WHEN amount_paid > 0 THEN 'partial'
          ELSE 'pending'
        END
    WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'cancelled', v_fully_cancelled,
    'already_cancelled', false,
    'sales_order_id', v_order.id,
    'order_number', v_order_number,
    'returned_item_value', CASE WHEN v_has_returned_items THEN v_returned_value ELSE v_order.net_amount END,
    'remaining_balance', CASE WHEN v_fully_cancelled THEN 0 ELSE greatest(v_order.net_amount - v_adjustment_amount, 0) END,
    'journal_entry_id', v_journal_id,
    'reversal_journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_credit_sale(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_credit_sale(UUID, TEXT, JSONB) TO authenticated;

COMMIT;
BEGIN;

CREATE OR REPLACE FUNCTION public.process_fifo_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quantity INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_total_cost NUMERIC(15, 2) := 0;
  v_layer public.inventory_cost_layers%ROWTYPE;
  v_inventory_account UUID;
  v_offset_account UUID;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_description TEXT;
  v_is_outflow BOOLEAN;
  v_stock_quantity INTEGER;
  v_valued_quantity INTEGER;
  v_offset_name TEXT;
  v_reference TEXT := trim(COALESCE(NEW.reference_number, ''));
BEGIN
  IF NEW.movement_type IN ('purchase', 'production', 'return')
     OR (NEW.movement_type = 'adjustment' AND NEW.quantity > 0) THEN
    IF NEW.quantity <= 0 OR NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
      RAISE EXCEPTION 'Inbound inventory requires a positive quantity and verified unit cost';
    END IF;
    IF NEW.movement_type IN ('purchase', 'return') AND v_reference = '' THEN
      RAISE EXCEPTION 'Supplier purchases need an invoice reference; returns need the original sale reference';
    END IF;

    IF NEW.movement_type = 'return' THEN
      SELECT COALESCE(sum(soi.quantity), 0) INTO v_stock_quantity
      FROM public.sales_orders so
      JOIN public.sales_order_items soi ON soi.sales_order_id = so.id
      WHERE so.order_number = v_reference AND soi.product_id = NEW.product_id;
      SELECT COALESCE(sum(abs(sm.quantity)), 0) INTO v_valued_quantity
      FROM public.stock_movements sm
      WHERE sm.id <> NEW.id
        AND sm.movement_type = 'return'
        AND sm.reference_number = v_reference
        AND sm.product_id = NEW.product_id;
      IF v_stock_quantity = 0 OR v_valued_quantity + NEW.quantity > v_stock_quantity THEN
        RAISE EXCEPTION 'Returned quantity exceeds the original sale or the sale reference is invalid';
      END IF;
    END IF;

    INSERT INTO public.inventory_cost_layers (
      product_id, source_movement_id, received_date, quantity_received,
      quantity_remaining, unit_cost, created_by
    ) VALUES (
      NEW.product_id, NEW.id, NEW.movement_date, NEW.quantity,
      NEW.quantity, NEW.unit_cost, NEW.created_by
    );
    UPDATE public.stock_movements
    SET total_cost = round(NEW.quantity * NEW.unit_cost, 2)
    WHERE id = NEW.id;

    SELECT id INTO v_inventory_account
    FROM public.chart_of_accounts
    WHERE account_name = 'Inventory' AND account_type = 'asset' AND is_active
    ORDER BY created_at LIMIT 1;

    IF NEW.movement_type = 'purchase' THEN
      v_offset_name := 'Account Payable';
      v_entry_number := 'INVPUR-' || v_reference || '-' || NEW.product_id::TEXT || '-' || NEW.id::TEXT;
      v_description := 'Inventory received on supplier invoice ' || v_reference
        || CASE WHEN COALESCE(NEW.description, '') = '' THEN '' ELSE ' (' || NEW.description || ')' END;
    ELSIF NEW.movement_type = 'production' THEN
      v_offset_name := 'Work in Process Inventory';
      v_entry_number := 'INVPROD-' || NEW.id::TEXT;
      v_description := 'Finished goods transferred from work in process';
    ELSIF NEW.movement_type = 'return' THEN
      v_offset_name := 'Cost of Goods Sold';
      v_entry_number := 'INVRETURN-' || NEW.id::TEXT;
      v_description := 'Inventory returned against sale ' || v_reference;
    ELSE
      v_offset_name := 'Inventory Adjustment Gain';
      v_entry_number := 'INVGAIN-' || NEW.id::TEXT;
      v_description := 'Positive inventory adjustment';
    END IF;

    SELECT id INTO v_offset_account
    FROM public.chart_of_accounts
    WHERE account_name = v_offset_name
      AND account_type = CASE v_offset_name
        WHEN 'Account Payable' THEN 'liability'
        WHEN 'Work in Process Inventory' THEN 'asset'
        WHEN 'Cost of Goods Sold' THEN 'expense'
        ELSE 'revenue'
      END
      AND is_active
    ORDER BY created_at LIMIT 1;
    IF v_inventory_account IS NULL OR v_offset_account IS NULL THEN
      RAISE EXCEPTION 'Inventory receipt requires active Inventory and % accounts', v_offset_name;
    END IF;

    INSERT INTO public.journal_entries (
      entry_number, entry_date, description, reference_number, entry_type, status,
      created_by, posted_by, posted_at
    ) VALUES (
      v_entry_number, NEW.movement_date, v_description, v_reference,
      'general', 'posted', NEW.created_by, NEW.created_by, now()
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES
      (v_entry_id, v_inventory_account, round(NEW.quantity * NEW.unit_cost, 2), 0, v_description),
      (v_entry_id, v_offset_account, 0, round(NEW.quantity * NEW.unit_cost, 2), v_description);
    RETURN NEW;
  END IF;

  v_is_outflow := NEW.movement_type IN ('sale', 'transfer', 'waste')
    OR (NEW.movement_type = 'adjustment' AND NEW.quantity < 0);
  IF NOT v_is_outflow THEN
    RETURN NEW;
  END IF;

  v_quantity := abs(NEW.quantity);
  IF v_quantity <= 0 THEN
    RAISE EXCEPTION 'Inventory outflow quantity must be greater than zero';
  END IF;

  SELECT COALESCE(sum(quantity_on_hand), 0) INTO v_stock_quantity
  FROM public.stock_inventory
  WHERE product_id = NEW.product_id;
  SELECT COALESCE(sum(quantity_remaining), 0) INTO v_valued_quantity
  FROM public.inventory_cost_layers
  WHERE product_id = NEW.product_id;
  IF v_valued_quantity < v_stock_quantity + v_quantity THEN
    RAISE EXCEPTION 'Value all existing stock for this product with verified opening FIFO costs before recording an outflow';
  END IF;

  IF NEW.movement_type = 'sale' AND NOT EXISTS (
    SELECT 1
    FROM public.sales_orders so
    JOIN public.sales_order_items soi ON soi.sales_order_id = so.id
    WHERE so.order_number = NEW.reference_number
      AND soi.product_id = NEW.product_id
      AND soi.quantity = v_quantity
  ) THEN
    RAISE EXCEPTION 'Record product sales through the Sales transaction so revenue and inventory costs stay linked';
  END IF;

  SELECT id INTO v_inventory_account
  FROM public.chart_of_accounts
  WHERE account_name = 'Inventory' AND account_type = 'asset' AND is_active
  ORDER BY created_at
  LIMIT 1;
  IF v_inventory_account IS NULL THEN
    RAISE EXCEPTION 'Inventory asset account is missing from the active chart of accounts';
  END IF;

  v_remaining := v_quantity;
  FOR v_layer IN
    SELECT *
    FROM public.inventory_cost_layers
    WHERE product_id = NEW.product_id AND quantity_remaining > 0
    ORDER BY received_date, created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(v_remaining, v_layer.quantity_remaining);
    v_total_cost := v_total_cost + round(v_take * v_layer.unit_cost, 2);

    UPDATE public.inventory_cost_layers
    SET quantity_remaining = quantity_remaining - v_take
    WHERE id = v_layer.id;

    INSERT INTO public.inventory_cost_allocations (
      stock_movement_id, cost_layer_id, quantity, unit_cost, total_cost
    ) VALUES (
      NEW.id, v_layer.id, v_take, v_layer.unit_cost, round(v_take * v_layer.unit_cost, 2)
    );
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Not enough valued stock for this movement: % unit(s) need an approved opening FIFO cost', v_remaining;
  END IF;

  UPDATE public.stock_movements
  SET unit_cost = round(v_total_cost / v_quantity, 2),
      total_cost = v_total_cost
  WHERE id = NEW.id;

  IF NEW.movement_type = 'sale' THEN
    SELECT id INTO v_offset_account
    FROM public.chart_of_accounts
    WHERE account_name = 'Cost of Goods Sold' AND account_type = 'expense' AND is_active
    ORDER BY created_at
    LIMIT 1;
    v_entry_number := 'COGS-' || NEW.reference_number;
    v_description := 'FIFO cost of goods sold: ' || NEW.reference_number;
  ELSIF NEW.movement_type = 'transfer' THEN
    SELECT id INTO v_offset_account
    FROM public.chart_of_accounts
    WHERE account_name = 'Inventory in Transit' AND account_type = 'asset' AND is_active
    ORDER BY created_at
    LIMIT 1;
    v_entry_number := 'INVTRANS-' || NEW.id::TEXT;
    v_description := 'FIFO inventory transfer: ' || COALESCE(NEW.reference_number, NEW.id::TEXT);
  ELSE
    SELECT id INTO v_offset_account
    FROM public.chart_of_accounts
    WHERE account_name = 'Inventory Loss' AND account_type = 'expense' AND is_active
    ORDER BY created_at
    LIMIT 1;
    v_entry_number := 'INVLOSS-' || NEW.id::TEXT;
    v_description := 'FIFO inventory write-off: ' || COALESCE(NEW.reference_number, NEW.id::TEXT);
  END IF;

  IF v_offset_account IS NULL THEN
    RAISE EXCEPTION 'The required inventory offset account is missing or inactive';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number = v_entry_number) THEN
    RAISE EXCEPTION 'Inventory cost posting % already exists', v_entry_number;
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    v_entry_number, NEW.movement_date, v_description, NEW.reference_number,
    'general', 'posted', NEW.created_by, NEW.created_by, now()
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES
    (v_entry_id, v_offset_account, v_total_cost, 0, v_description),
    (v_entry_id, v_inventory_account, 0, v_total_cost, v_description);

  RETURN NEW;
END;
$$;

COMMIT;

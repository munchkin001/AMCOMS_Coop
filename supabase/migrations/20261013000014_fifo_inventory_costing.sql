ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15, 2)
  CHECK (total_cost IS NULL OR total_cost >= 0);

CREATE TABLE public.inventory_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  source_movement_id UUID NOT NULL UNIQUE REFERENCES public.stock_movements(id),
  received_date DATE NOT NULL,
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0 AND quantity_remaining <= quantity_received),
  unit_cost NUMERIC(15, 4) NOT NULL CHECK (unit_cost > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.staff(id)
);

CREATE INDEX inventory_cost_layers_fifo_idx
  ON public.inventory_cost_layers(product_id, received_date, created_at, id)
  WHERE quantity_remaining > 0;

CREATE TABLE public.inventory_cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_movement_id UUID NOT NULL REFERENCES public.stock_movements(id),
  cost_layer_id UUID NOT NULL REFERENCES public.inventory_cost_layers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(15, 4) NOT NULL CHECK (unit_cost > 0),
  total_cost NUMERIC(15, 2) NOT NULL CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_cost_allocations_movement_idx
  ON public.inventory_cost_allocations(stock_movement_id);

CREATE TRIGGER audit_inventory_cost_layers
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_cost_layers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_inventory_cost_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_cost_allocations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view FIFO inventory costs"
  ON public.inventory_cost_layers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_active));

CREATE POLICY "Staff can view FIFO cost allocations"
  ON public.inventory_cost_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_active));

GRANT SELECT ON public.inventory_cost_layers, public.inventory_cost_allocations TO authenticated;

-- Inventory and sale writes must use the atomic RPCs so stock, FIFO costs, and
-- journal entries cannot drift apart through direct table writes.
DROP POLICY IF EXISTS "Authenticated users can manage stock_inventory" ON public.stock_inventory;
DROP POLICY IF EXISTS "Inventory staff can manage stock" ON public.stock_inventory;
DROP POLICY IF EXISTS "Authenticated users can manage stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Inventory staff can create movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can manage production_records" ON public.production_records;
DROP POLICY IF EXISTS "Inventory staff can manage production" ON public.production_records;
DROP POLICY IF EXISTS "Authenticated users can manage sales_orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Authorized staff can manage sales" ON public.sales_orders;
DROP POLICY IF EXISTS "Authenticated users can manage sales_order_items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Authorized staff can manage sales items" ON public.sales_order_items;

INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, is_active)
SELECT account_code, account_name, account_type, 'Inventory', true
FROM (VALUES
  ('INV-ASSET', 'Inventory', 'asset'),
  ('INV-COGS', 'Cost of Goods Sold', 'expense'),
  ('INV-LOSS', 'Inventory Loss', 'expense'),
  ('INV-TRANSIT', 'Inventory in Transit', 'asset'),
  ('INV-WIP', 'Work in Process Inventory', 'asset'),
  ('INV-OPENING', 'Opening Inventory Balance', 'equity'),
  ('INV-GAIN', 'Inventory Adjustment Gain', 'revenue')
) AS accounts(account_code, account_name, account_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts existing
  WHERE existing.account_name = accounts.account_name
    AND existing.account_type = accounts.account_type
)
ON CONFLICT (account_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.require_valued_product_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_on_hand INTEGER;
  v_available INTEGER;
  v_valued INTEGER;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM id
  FROM public.stock_inventory
  WHERE product_id = NEW.product_id
  FOR UPDATE;
  SELECT COALESCE(sum(quantity_on_hand), 0),
         COALESCE(sum(GREATEST(quantity_on_hand - COALESCE(quantity_reserved, 0), 0)), 0)
  INTO v_on_hand, v_available
  FROM public.stock_inventory
  WHERE product_id = NEW.product_id;
  SELECT COALESCE(sum(quantity_remaining), 0)
  INTO v_valued
  FROM public.inventory_cost_layers
  WHERE product_id = NEW.product_id;

  IF v_on_hand < NEW.quantity OR v_available < NEW.quantity THEN
    RAISE EXCEPTION 'There is not enough available stock to complete this sale';
  END IF;
  IF v_valued < v_on_hand THEN
    RAISE EXCEPTION 'Value all existing stock for this product with verified opening FIFO costs before selling it';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER require_valued_product_sale
  BEFORE INSERT ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.require_valued_product_sale();

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
    IF NEW.movement_type = 'purchase' AND EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.id <> NEW.id
        AND sm.movement_type = 'purchase'
        AND sm.product_id = NEW.product_id
        AND sm.reference_number = v_reference
    ) THEN
      RAISE EXCEPTION 'This product is already recorded against supplier invoice %; combine same-product invoice lines into one restock', v_reference;
    END IF;

    IF NEW.movement_type = 'return' THEN
      SELECT COALESCE(sum(soi.quantity), 0) INTO v_stock_quantity
      FROM public.sales_orders so
      JOIN public.sales_order_items soi ON soi.sales_order_id = so.id
      WHERE so.order_number = v_reference AND soi.product_id = NEW.product_id;
      SELECT COALESCE(sum(abs(sm.quantity)), 0) INTO v_valued_quantity
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'return'
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
      v_entry_number := 'INVPUR-' || v_reference || '-' || NEW.product_id::TEXT;
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

CREATE TRIGGER process_fifo_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.process_fifo_stock_movement();

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_product_id UUID,
  p_movement_type TEXT,
  p_quantity INTEGER,
  p_direction INTEGER,
  p_movement_date DATE,
  p_reference TEXT,
  p_description TEXT,
  p_unit_cost NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_inventory public.stock_inventory%ROWTYPE;
  v_available INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_movement_id UUID;
  v_product_name TEXT;
  v_inbound BOOLEAN;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_any_role(ARRAY['inventory', 'manager']) THEN
    RAISE EXCEPTION 'Only active Inventory staff or Managers can record stock movements';
  END IF;
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0
     OR p_direction IS NULL OR p_direction NOT IN (-1, 1) OR p_movement_date IS NULL
     OR p_movement_type IS NULL THEN
    RAISE EXCEPTION 'Select a product, valid quantity, direction, and movement date';
  END IF;
  IF p_movement_type NOT IN ('purchase', 'production', 'return', 'adjustment', 'transfer', 'waste') THEN
    RAISE EXCEPTION 'Use the correct inventory workflow for this movement type';
  END IF;
  IF p_movement_type IN ('purchase', 'production', 'return') AND p_direction <> 1 THEN
    RAISE EXCEPTION 'Purchase, production, and returned stock must be inbound movements';
  END IF;
  IF p_movement_type IN ('transfer', 'waste') AND p_direction <> -1 THEN
    RAISE EXCEPTION 'Transfer and waste movements must be outbound';
  END IF;
  IF p_movement_type IN ('purchase', 'return') AND COALESCE(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'Supplier purchases need an invoice number; returns need the original sale reference';
  END IF;

  v_inbound := p_direction = 1;
  IF v_inbound AND (p_unit_cost IS NULL OR p_unit_cost <= 0) THEN
    RAISE EXCEPTION 'Enter a verified unit cost greater than zero to receive inventory';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stock:' || p_product_id::TEXT));

  SELECT product_name INTO v_product_name
  FROM public.products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected product is not active';
  END IF;

  IF v_inbound THEN
    SELECT * INTO v_inventory
    FROM public.stock_inventory
    WHERE product_id = p_product_id
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.stock_inventory
      SET quantity_on_hand = quantity_on_hand + p_quantity,
          last_restock_date = p_movement_date,
          updated_at = now()
      WHERE id = v_inventory.id;
    ELSE
      INSERT INTO public.stock_inventory (product_id, quantity_on_hand, last_restock_date)
      VALUES (p_product_id, p_quantity, p_movement_date);
    END IF;
  ELSE
    PERFORM id
    FROM public.stock_inventory
    WHERE product_id = p_product_id
    FOR UPDATE;
    SELECT COALESCE(sum(GREATEST(quantity_on_hand - COALESCE(quantity_reserved, 0), 0)), 0)
    INTO v_available
    FROM public.stock_inventory
    WHERE product_id = p_product_id;
    IF v_available < p_quantity THEN
      RAISE EXCEPTION 'Not enough stock for %. Available quantity: %', v_product_name, v_available;
    END IF;

    v_remaining := p_quantity;
    FOR v_inventory IN
      SELECT * FROM public.stock_inventory
      WHERE product_id = p_product_id
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining = 0;
      v_take := LEAST(v_remaining, GREATEST(v_inventory.quantity_on_hand - COALESCE(v_inventory.quantity_reserved, 0), 0));
      IF v_take > 0 THEN
        UPDATE public.stock_inventory
        SET quantity_on_hand = quantity_on_hand - v_take,
            updated_at = now()
        WHERE id = v_inventory.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, unit_cost, reference_number,
    movement_date, description, created_by
  ) VALUES (
    p_product_id, p_movement_type,
    CASE WHEN p_movement_type = 'adjustment' THEN p_quantity * p_direction ELSE p_quantity END,
    CASE WHEN v_inbound THEN p_unit_cost ELSE NULL END,
    NULLIF(trim(p_reference), ''), p_movement_date,
    NULLIF(trim(p_description), ''), v_staff_id
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement(UUID, TEXT, INTEGER, INTEGER, DATE, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(UUID, TEXT, INTEGER, INTEGER, DATE, TEXT, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.value_existing_inventory_fifo(
  p_product_id UUID,
  p_unit_cost NUMERIC,
  p_received_date DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_product_code TEXT;
  v_stock_quantity INTEGER;
  v_valued_quantity INTEGER;
  v_unvalued_quantity INTEGER;
  v_movement_id UUID;
  v_journal_id UUID;
  v_inventory_account UUID;
  v_offset_account UUID;
  v_reference TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_any_role(ARRAY['inventory', 'manager']) THEN
    RAISE EXCEPTION 'Only active Inventory staff or Managers can value existing stock';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 OR p_received_date IS NULL OR p_received_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Enter a verified opening unit cost and a valid stock date';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stock:' || p_product_id::TEXT));
  SELECT product_code INTO v_product_code
  FROM public.products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected product is not active';
  END IF;

  PERFORM id FROM public.stock_inventory WHERE product_id = p_product_id FOR UPDATE;
  SELECT COALESCE(sum(quantity_on_hand), 0) INTO v_stock_quantity
  FROM public.stock_inventory
  WHERE product_id = p_product_id;
  SELECT COALESCE(sum(quantity_remaining), 0) INTO v_valued_quantity
  FROM public.inventory_cost_layers
  WHERE product_id = p_product_id;
  v_unvalued_quantity := v_stock_quantity - v_valued_quantity;
  IF v_unvalued_quantity <= 0 THEN
    RAISE EXCEPTION 'This product has no unvalued on-hand quantity';
  END IF;

  v_reference := 'OPEN-' || v_product_code || '-' || upper(substr(gen_random_uuid()::TEXT, 1, 8));
  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, unit_cost, total_cost, reference_number,
    movement_date, description, created_by
  ) VALUES (
    p_product_id, 'adjustment', 0, p_unit_cost,
    round(v_unvalued_quantity * p_unit_cost, 2), v_reference,
    p_received_date, 'Opening FIFO valuation for existing on-hand stock (' || v_unvalued_quantity || ' units)', v_staff_id
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.inventory_cost_layers (
    product_id, source_movement_id, received_date, quantity_received,
    quantity_remaining, unit_cost, created_by
  ) VALUES (
    p_product_id, v_movement_id, p_received_date, v_unvalued_quantity,
    v_unvalued_quantity, p_unit_cost, v_staff_id
  );

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    'INVOPEN-' || v_movement_id::TEXT, p_received_date,
    'Opening FIFO valuation for ' || v_product_code, v_reference,
    'general', 'posted', v_staff_id, v_staff_id, now()
  ) RETURNING id INTO v_journal_id;

  SELECT id INTO v_inventory_account
  FROM public.chart_of_accounts
  WHERE account_name = 'Inventory' AND account_type = 'asset' AND is_active
  ORDER BY created_at LIMIT 1;
  SELECT id INTO v_offset_account
  FROM public.chart_of_accounts
  WHERE account_name = 'Opening Inventory Balance' AND account_type = 'equity' AND is_active
  ORDER BY created_at LIMIT 1;
  IF v_inventory_account IS NULL OR v_offset_account IS NULL THEN
    RAISE EXCEPTION 'Active Inventory and Opening Inventory Balance accounts are required';
  END IF;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES
    (v_journal_id, v_inventory_account, round(v_unvalued_quantity * p_unit_cost, 2), 0, v_reference),
    (v_journal_id, v_offset_account, 0, round(v_unvalued_quantity * p_unit_cost, 2), v_reference);

  RETURN v_unvalued_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.value_existing_inventory_fifo(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.value_existing_inventory_fifo(UUID, NUMERIC, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_production_with_inventory(
  p_production_number TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_production_date DATE,
  p_unit_cost NUMERIC,
  p_batch_number TEXT,
  p_notes TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_production_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_any_role(ARRAY['inventory', 'manager']) THEN
    RAISE EXCEPTION 'Only active Inventory staff or Managers can record production';
  END IF;
  IF COALESCE(trim(p_production_number), '') = '' OR p_product_id IS NULL
     OR p_quantity IS NULL OR p_quantity <= 0 OR p_production_date IS NULL
     OR p_unit_cost IS NULL OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'Enter a production number, product, positive quantity, date, and verified unit cost';
  END IF;

  INSERT INTO public.production_records (
    production_number, product_id, quantity_produced, production_date,
    production_cost, batch_number, status, notes, created_by
  ) VALUES (
    trim(p_production_number), p_product_id, p_quantity, p_production_date,
    round(p_quantity * p_unit_cost, 2), NULLIF(trim(p_batch_number), ''),
    'completed', NULLIF(trim(p_notes), ''), v_staff_id
  ) RETURNING id INTO v_production_id;

  PERFORM public.record_inventory_movement(
    p_product_id, 'production', p_quantity, 1, p_production_date,
    COALESCE(NULLIF(trim(p_batch_number), ''), trim(p_production_number)),
    'Production ' || trim(p_production_number), p_unit_cost
  );

  RETURN v_production_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_production_with_inventory(TEXT, UUID, INTEGER, DATE, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_production_with_inventory(TEXT, UUID, INTEGER, DATE, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_product(p_product JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF public.current_staff_id() IS NULL OR NOT public.has_any_role(ARRAY['inventory', 'manager']) THEN
    RAISE EXCEPTION 'Only active Inventory staff or Managers can create products';
  END IF;
  IF COALESCE(trim(p_product->>'product_code'), '') = ''
     OR COALESCE(trim(p_product->>'product_name'), '') = ''
     OR COALESCE(trim(p_product->>'unit_of_measure'), '') = '' THEN
    RAISE EXCEPTION 'Product code, name, and unit of measure are required';
  END IF;

  INSERT INTO public.products (
    product_code, product_name, category_id, unit_of_measure,
    unit_price, cost_price, reorder_level, description
  ) VALUES (
    trim(p_product->>'product_code'),
    trim(p_product->>'product_name'),
    NULLIF(p_product->>'category_id', '')::UUID,
    trim(p_product->>'unit_of_measure'),
    COALESCE(NULLIF(p_product->>'unit_price', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_product->>'cost_price', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_product->>'reorder_level', '')::INTEGER, 0),
    NULLIF(trim(p_product->>'description'), '')
  ) RETURNING id INTO v_product_id;

  INSERT INTO public.stock_inventory (product_id, quantity_on_hand)
  VALUES (v_product_id, 0);

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_product(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_product(JSONB) TO authenticated;

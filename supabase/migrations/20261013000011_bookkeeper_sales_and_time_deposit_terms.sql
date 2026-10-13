ALTER TABLE public.savings_accounts
  ADD COLUMN IF NOT EXISTS maturity_date DATE;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS cash_receipt_id UUID REFERENCES public.cash_receipts(id),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0;

UPDATE public.sales_orders
SET amount_paid = net_amount
WHERE payment_status = 'paid' AND amount_paid = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_orders_amount_paid_check'
      AND conrelid = 'public.sales_orders'::regclass
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_amount_paid_check
      CHECK (amount_paid >= 0 AND amount_paid <= net_amount);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_cash_receipt_id_idx
  ON public.sales_orders(cash_receipt_id)
  WHERE cash_receipt_id IS NOT NULL;

ALTER TABLE public.sales_order_items
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS item_description TEXT;

CREATE OR REPLACE FUNCTION public.create_loan_from_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_term INTEGER;
  v_freq TEXT;
  q JSONB;
  v_loan UUID;
  v_number TEXT;
  v_seq INTEGER;
  v_prefix TEXT := 'L-' || to_char(CURRENT_DATE, 'YYYY') || '-';
  n INTEGER;
  v_installment NUMERIC;
  v_total NUMERIC;
  v_due DATE;
  i INTEGER;
BEGIN
  IF NEW.request_type <> 'loan_application' OR NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.loans WHERE request_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_term := COALESCE(NULLIF(NEW.request_data->>'term_months', '')::INTEGER, 12);
  v_freq := COALESCE(NULLIF(NEW.request_data->>'payment_frequency', ''), 'monthly');
  q := public.loan_quote(NEW.amount, v_term, v_freq);
  n := (q->>'installments')::INTEGER;
  v_installment := (q->>'installment_amount')::NUMERIC;
  v_total := (q->>'total_payable')::NUMERIC;

  PERFORM pg_advisory_xact_lock(hashtext('loan_number'));
  SELECT COALESCE(MAX(substring(loan_number FROM '(\d+)$')::INTEGER), 0) + 1 INTO v_seq
  FROM public.loans WHERE loan_number LIKE v_prefix || '%';
  v_number := v_prefix || lpad(v_seq::TEXT, 5, '0');

  INSERT INTO public.loans (
    loan_number, member_id, principal_amount, interest_rate, term_months,
    monthly_payment, total_interest, total_amount, balance,
    application_date, approval_date, release_date, maturity_date, status, approved_by,
    notes, payment_frequency, installments, installment_amount, penalty_rate, request_id
  ) VALUES (
    v_number, NEW.member_id, NEW.amount, (q->>'annual_rate')::NUMERIC, v_term,
    round(v_total / v_term, 2), (q->>'total_interest')::NUMERIC, v_total, NEW.amount,
    NEW.created_at::DATE, CURRENT_DATE, CURRENT_DATE,
    CASE WHEN v_freq = 'weekly' THEN CURRENT_DATE + (n * 7) ELSE (CURRENT_DATE + make_interval(months => n))::DATE END,
    'active', NEW.reviewed_by,
    NULLIF(NEW.request_data->>'purpose', ''), v_freq, n, v_installment, (q->>'penalty_rate')::NUMERIC, NEW.id
  ) RETURNING id INTO v_loan;

  FOR i IN 1..n LOOP
    v_due := CASE WHEN v_freq = 'weekly' THEN CURRENT_DATE + (i * 7)
                  ELSE (CURRENT_DATE + make_interval(months => i))::DATE END;
    INSERT INTO public.loan_schedule (loan_id, installment_number, due_date, amount_due)
    VALUES (
      v_loan, i, v_due,
      CASE WHEN i = n THEN v_total - v_installment * (n - 1) ELSE v_installment END
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_member_receipt(p_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  v_is_loan_payment BOOLEAN;
  v_loan RECORD;
  v_apply NUMERIC(15, 2);
  v_next INTEGER;
  v_reason TEXT;
  v_selected_loan_id UUID := NULLIF(current_setting('amcoms.selected_loan_id', true), '')::UUID;
BEGIN
  SELECT * INTO r FROM public.cash_receipts WHERE id = p_receipt_id;
  IF NOT FOUND OR r.status <> 'recorded' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_activity
    WHERE reference = r.receipt_number AND activity_type IN ('loan_payment', 'receipt')
  ) OR EXISTS (
    SELECT 1 FROM public.data_discrepancies WHERE source_type = 'cash_receipt' AND source_id = r.id
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.cash_receipt_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.cash_receipt_id = r.id AND a.account_name = 'Loan Receivable' AND l.side = 'credit'
  ) OR COALESCE(r.description, '') ~* 'member-loan-payment' INTO v_is_loan_payment;

  IF NOT v_is_loan_payment THEN
    IF r.member_id IS NOT NULL THEN
      INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by)
      VALUES (r.member_id, 'receipt', COALESCE(NULLIF(trim(r.description), ''), 'Payment received'), r.amount, r.receipt_number, r.created_by);
    END IF;
    RETURN;
  END IF;

  IF r.member_id IS NULL THEN
    v_reason := 'Loan payment recorded for "' || r.received_from || '" but no member account is linked to this receipt.';
    INSERT INTO public.data_discrepancies (source_type, source_id, reference, category, reason, amount, created_by)
    VALUES ('cash_receipt', r.id, r.receipt_number, 'Loan payment', v_reason, r.amount, r.created_by);
    RETURN;
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE member_id = r.member_id AND status = 'active' AND balance > 0
    AND (v_selected_loan_id IS NULL OR id = v_selected_loan_id)
  ORDER BY release_date NULLS LAST, created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_reason := 'Loan payment of ' || to_char(r.amount, 'FM999,999,990.00') || ' was recorded but the member has no matching active loan to apply it to.';
    INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by, is_discrepancy, note)
    VALUES (r.member_id, 'loan_payment', 'Loan payment (discrepancy)', r.amount, r.receipt_number, r.created_by, true, v_reason);
    INSERT INTO public.data_discrepancies (member_id, source_type, source_id, reference, category, reason, amount, created_by)
    VALUES (r.member_id, 'cash_receipt', r.id, r.receipt_number, 'Loan payment', v_reason, r.amount, r.created_by);
    RETURN;
  END IF;

  v_apply := CASE
    WHEN v_selected_loan_id IS NOT NULL THEN r.amount
    ELSE LEAST(r.amount, v_loan.balance)
  END;
  SELECT COALESCE(MAX(payment_number), 0) + 1 INTO v_next
  FROM public.loan_payments WHERE loan_id = v_loan.id;

  INSERT INTO public.loan_payments (
    loan_id, payment_number, payment_date, amount_paid, principal_paid, interest_paid,
    balance_after, payment_method, reference_number, receipt_id, created_by
  ) VALUES (
    v_loan.id, v_next, r.receipt_date, v_apply, v_apply, 0,
    v_loan.balance - v_apply, r.payment_method, r.receipt_number, r.id, r.created_by
  );

  IF r.amount - v_apply > 0.009 THEN
    v_reason := 'Loan payment of ' || to_char(r.amount, 'FM999,999,990.00') || ' exceeds the outstanding balance of '
      || to_char(v_loan.balance, 'FM999,999,990.00') || ' on loan ' || v_loan.loan_number || '. Excess of '
      || to_char(r.amount - v_apply, 'FM999,999,990.00') || ' was not applied.';
    INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by, is_discrepancy, note)
    VALUES (r.member_id, 'loan_payment', 'Loan payment (' || v_loan.loan_number || ')', r.amount, r.receipt_number, r.created_by, true, v_reason);
    INSERT INTO public.data_discrepancies (member_id, source_type, source_id, reference, category, reason, amount, created_by)
    VALUES (r.member_id, 'cash_receipt', r.id, r.receipt_number, 'Loan overpayment', v_reason, r.amount - v_apply, r.created_by);
  ELSE
    INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by)
    VALUES (r.member_id, 'loan_payment', 'Loan payment (' || v_loan.loan_number || ')', v_apply, r.receipt_number, r.created_by);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_order_items_product_or_description_check'
      AND conrelid = 'public.sales_order_items'::regclass
  ) THEN
    ALTER TABLE public.sales_order_items
      ADD CONSTRAINT sales_order_items_product_or_description_check
      CHECK (product_id IS NOT NULL OR COALESCE(trim(item_description), '') <> '');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cooperative_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_date DATE := NULLIF(p_sale->>'transaction_date', '')::DATE;
  v_reference TEXT := trim(COALESCE(p_sale->>'reference_number', ''));
  v_flow TEXT := COALESCE(NULLIF(p_sale->>'flow', ''), 'sale');
  v_selected_order_id UUID := NULLIF(p_sale->>'sales_order_id', '')::UUID;
  v_customer TEXT := trim(COALESCE(p_sale->>'customer_name', ''));
  v_member_id UUID := NULLIF(p_sale->>'member_id', '')::UUID;
  v_product_id UUID := NULLIF(p_sale->>'product_id', '')::UUID;
  v_item_description TEXT := trim(COALESCE(p_sale->>'item_description', ''));
  v_quantity INTEGER := COALESCE(NULLIF(p_sale->>'quantity', '')::INTEGER, 0);
  v_amount NUMERIC(15, 2) := round(COALESCE(NULLIF(p_sale->>'amount', '')::NUMERIC, 0), 2);
  v_payment_type TEXT := COALESCE(NULLIF(p_sale->>'payment_type', ''), 'cash');
  v_payment_method TEXT := COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash');
  v_cash_account TEXT := COALESCE(NULLIF(p_sale->>'cash_account', ''), 'Cash on Hand');
  v_revenue_name TEXT := trim(COALESCE(p_sale->>'revenue_account', ''));
  v_staff_id UUID := public.current_staff_id();
  v_order_id UUID;
  v_receipt_id UUID;
  v_journal_id UUID;
  v_receivable_account_id UUID;
  v_revenue_account_id UUID;
  v_order RECORD;
  v_amount_due NUMERIC(15, 2);
  v_product RECORD;
  v_member RECORD;
  v_stock RECORD;
  v_available INTEGER := 0;
  v_remaining INTEGER;
  v_take INTEGER;
  v_has_inventory BOOLEAN := false;
  v_receipt_result JSONB;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record sales';
  END IF;
  IF v_flow = 'collection' THEN
    IF v_date IS NULL OR v_reference = '' OR v_selected_order_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Collection date, receipt number, credit sale, and a positive amount are required';
    END IF;
    IF v_payment_method NOT IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other')
       OR v_cash_account NOT IN ('Cash on Hand', 'Cash in Bank') THEN
      RAISE EXCEPTION 'Select a valid collection payment method and cash account';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('cash_receipt:' || v_reference));
    SELECT * INTO v_order
    FROM public.sales_orders
    WHERE id = v_selected_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select an outstanding credit sale';
    END IF;
    IF v_order.payment_status NOT IN ('pending', 'partial') THEN
      RAISE EXCEPTION 'Select an outstanding credit sale';
    END IF;
    v_amount_due := v_order.net_amount - COALESCE(v_order.amount_paid, 0);
    IF v_amount > v_amount_due THEN
      RAISE EXCEPTION 'Collection exceeds the outstanding sale balance of %', to_char(v_amount_due, 'FM999,999,990.00');
    END IF;
    IF EXISTS (SELECT 1 FROM public.cash_receipts WHERE receipt_number = v_reference)
       OR EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number = 'CR-' || v_reference)
       OR EXISTS (SELECT 1 FROM public.sales_orders WHERE order_number = v_reference) THEN
      RAISE EXCEPTION 'Receipt number % has already been used; enter a new receipt number', v_reference;
    END IF;

    v_receivable_account_id := NULL;
    SELECT id INTO v_receivable_account_id
    FROM public.chart_of_accounts
    WHERE account_name = 'Account Receivable' AND account_type = 'asset' AND is_active;
    IF v_receivable_account_id IS NULL THEN
      RAISE EXCEPTION 'Account Receivable is missing from the active chart of accounts';
    END IF;
    v_receipt_result := public.save_cash_receipt(
      jsonb_build_object(
        'receipt_date', v_date,
        'receipt_number', v_reference,
        'received_from', v_order.customer_name,
        'member_id', v_order.member_id,
        'amount', v_amount,
        'payment_method', v_payment_method,
        'description', 'Collection for sale ' || v_order.order_number,
        'status', 'recorded'
      ),
      jsonb_build_array(
        jsonb_build_object('account', v_cash_account, 'amount', v_amount, 'side', 'debit'),
        jsonb_build_object('account', 'Account Receivable', 'amount', v_amount, 'side', 'credit')
      )
    );
    v_receipt_id := (v_receipt_result->>'receipt_id')::UUID;
    UPDATE public.sales_orders
    SET amount_paid = COALESCE(amount_paid, 0) + v_amount,
        payment_status = CASE
          WHEN COALESCE(amount_paid, 0) + v_amount >= net_amount THEN 'paid'
          ELSE 'partial'
        END
    WHERE id = v_order.id;
    RETURN jsonb_build_object(
      'sales_order_id', v_order.id,
      'cash_receipt_id', v_receipt_id,
      'payment_status', CASE WHEN COALESCE(v_order.amount_paid, 0) + v_amount >= v_order.net_amount THEN 'paid' ELSE 'partial' END
    );
  ELSIF v_flow <> 'sale' THEN
    RAISE EXCEPTION 'Unsupported sales transaction flow';
  END IF;

  IF v_date IS NULL OR v_reference = '' OR v_customer = '' OR v_item_description = ''
     OR v_quantity <= 0 OR v_amount <= 0 OR v_revenue_name = '' THEN
    RAISE EXCEPTION 'Date, reference, customer, product or service, positive quantity and amount, and sales account are required';
  END IF;
  IF v_payment_type NOT IN ('cash', 'credit') THEN
    RAISE EXCEPTION 'Choose paid now or on credit';
  END IF;
  IF v_payment_type = 'cash' THEN
    IF v_payment_method NOT IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other') THEN
      RAISE EXCEPTION 'Unsupported payment method';
    END IF;
    IF v_cash_account NOT IN ('Cash on Hand', 'Cash in Bank') THEN
      RAISE EXCEPTION 'Choose Cash on Hand or Cash in Bank';
    END IF;
  END IF;

  SELECT id INTO v_revenue_account_id
  FROM public.chart_of_accounts
  WHERE account_name = v_revenue_name AND account_type = 'revenue' AND is_active;
  IF v_revenue_account_id IS NULL THEN
    RAISE EXCEPTION 'The selected sales account is not an active revenue account';
  END IF;

  IF v_member_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.members
    WHERE id = v_member_id AND membership_status = 'active' AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'The selected customer is not an active member'; END IF;
    IF lower(v_customer) NOT IN (
      lower(trim(concat_ws(' ', v_member.first_name, v_member.middle_name, v_member.last_name))),
      lower(trim(concat_ws(' ', v_member.first_name, v_member.last_name)))
    ) THEN
      RAISE EXCEPTION 'Customer name does not match the selected member';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.members
      WHERE membership_status = 'active' AND archived_at IS NULL
        AND lower(v_customer) IN (
          lower(trim(concat_ws(' ', first_name, middle_name, last_name))),
          lower(trim(concat_ws(' ', first_name, last_name)))
        )
    ) THEN
      RAISE EXCEPTION 'Select this customer as a member instead of entering their name manually';
    END IF;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT id, product_name, is_active INTO v_product
    FROM public.products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected product is not active';
    END IF;
    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'The selected product is not active';
    END IF;
    IF v_item_description = '' THEN v_item_description := v_product.product_name; END IF;

    FOR v_stock IN
      SELECT id, quantity_on_hand, quantity_reserved
      FROM public.stock_inventory
      WHERE product_id = v_product_id
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      v_has_inventory := true;
      v_available := v_available + GREATEST(v_stock.quantity_on_hand - COALESCE(v_stock.quantity_reserved, 0), 0);
    END LOOP;
    IF v_has_inventory AND v_available < v_quantity THEN
      RAISE EXCEPTION 'Not enough stock for %. Available quantity: %', v_item_description, v_available;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cash_receipt:' || v_reference));
  PERFORM pg_advisory_xact_lock(hashtext('sales_order:' || v_reference));
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE order_number = v_reference)
     OR EXISTS (SELECT 1 FROM public.cash_receipts WHERE receipt_number = v_reference)
     OR EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number IN ('CR-' || v_reference, 'SALE-' || v_reference)) THEN
    RAISE EXCEPTION 'Reference number % has already been used; nothing was duplicated. Enter a new reference number.', v_reference;
  END IF;

  INSERT INTO public.sales_orders (
    order_number, order_date, member_id, customer_name, total_amount, net_amount,
    amount_paid, payment_status, order_status, notes, created_by
  ) VALUES (
    v_reference, v_date, v_member_id, v_customer, v_amount, v_amount,
    CASE WHEN v_payment_type = 'cash' THEN v_amount ELSE 0 END,
    CASE WHEN v_payment_type = 'cash' THEN 'paid' ELSE 'pending' END,
    'completed',
    CASE WHEN v_payment_type = 'credit' THEN 'Credit sale' ELSE 'Paid sale' END,
    v_staff_id
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.sales_order_items (
    sales_order_id, product_id, item_description, quantity, unit_price, line_total
  ) VALUES (
    v_order_id, v_product_id, v_item_description, v_quantity,
    round(v_amount / v_quantity, 2), v_amount
  );

  IF v_product_id IS NOT NULL AND v_has_inventory THEN
    v_remaining := v_quantity;
    FOR v_stock IN
      SELECT id, quantity_on_hand, quantity_reserved
      FROM public.stock_inventory
      WHERE product_id = v_product_id
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining = 0;
      v_take := LEAST(
        v_remaining,
        GREATEST(v_stock.quantity_on_hand - COALESCE(v_stock.quantity_reserved, 0), 0)
      );
      IF v_take > 0 THEN
        UPDATE public.stock_inventory
        SET quantity_on_hand = quantity_on_hand - v_take, updated_at = now()
        WHERE id = v_stock.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, reference_number, movement_date,
      description, created_by
    ) VALUES (
      v_product_id, 'sale', v_quantity, v_reference, v_date,
      'Sale to ' || v_customer, v_staff_id
    );
  END IF;

  IF v_payment_type = 'cash' THEN
    v_receipt_result := public.save_cash_receipt(
      jsonb_build_object(
        'receipt_date', v_date,
        'receipt_number', v_reference,
        'received_from', v_customer,
        'member_id', v_member_id,
        'amount', v_amount,
        'payment_method', v_payment_method,
        'description', 'Sale: ' || v_item_description,
        'status', 'recorded'
      ),
      jsonb_build_array(
        jsonb_build_object('account', v_cash_account, 'amount', v_amount, 'side', 'debit'),
        jsonb_build_object('account', v_revenue_name, 'amount', v_amount, 'side', 'credit')
      )
    );
    v_receipt_id := (v_receipt_result->>'receipt_id')::UUID;
    UPDATE public.sales_orders SET cash_receipt_id = v_receipt_id WHERE id = v_order_id;
  ELSE
    SELECT id INTO v_receivable_account_id
    FROM public.chart_of_accounts
    WHERE account_name = 'Account Receivable' AND account_type = 'asset' AND is_active;
    IF v_receivable_account_id IS NULL THEN
      RAISE EXCEPTION 'Account Receivable is missing from the active chart of accounts';
    END IF;
    INSERT INTO public.journal_entries (
      entry_number, entry_date, description, reference_number, entry_type, status,
      created_by, posted_by, posted_at
    ) VALUES (
      'SALE-' || v_reference, v_date, 'Credit sale: ' || v_item_description,
      v_reference, 'general', 'posted', v_staff_id, v_staff_id, now()
    ) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES
      (v_journal_id, v_receivable_account_id, v_amount, 0, 'Credit sale ' || v_reference),
      (v_journal_id, v_revenue_account_id, 0, v_amount, 'Sales revenue ' || v_reference);
  END IF;

  RETURN jsonb_build_object(
    'sales_order_id', v_order_id,
    'cash_receipt_id', v_receipt_id,
    'journal_entry_id', v_journal_id,
    'payment_status', CASE WHEN v_payment_type = 'cash' THEN 'paid' ELSE 'pending' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_cooperative_sale(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cooperative_sale(JSONB) TO authenticated;

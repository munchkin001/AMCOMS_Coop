BEGIN;

CREATE TABLE IF NOT EXISTS public.receipt_number_counters (
  receipt_year INTEGER PRIMARY KEY,
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

INSERT INTO public.receipt_number_counters (receipt_year, last_number)
SELECT
  substring(receipt_number FROM '^AMCOMS-([0-9]{4})-[0-9]{6}$')::INTEGER,
  MAX(substring(receipt_number FROM '^AMCOMS-[0-9]{4}-([0-9]{6})$')::BIGINT)
FROM public.cash_receipts
WHERE status = 'recorded'
  AND receipt_number ~ '^AMCOMS-[0-9]{4}-[0-9]{6}$'
GROUP BY substring(receipt_number FROM '^AMCOMS-([0-9]{4})-[0-9]{6}$')
ON CONFLICT (receipt_year) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.receipt_issuance_registry (
  receipt_number TEXT PRIMARY KEY,
  receipt_id UUID NOT NULL UNIQUE,
  receipt_year INTEGER NOT NULL,
  sequence_number BIGINT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  issued_by UUID REFERENCES public.staff(id),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.staff(id),
  void_reason TEXT,
  UNIQUE (receipt_year, sequence_number)
);

CREATE TABLE IF NOT EXISTS public.cash_receipt_sales_collections (
  receipt_id UUID PRIMARY KEY REFERENCES public.cash_receipts(id),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.cash_receipt_sales_collections (receipt_id, sales_order_id, amount)
SELECT r.id, so.id, r.amount
FROM public.cash_receipts r
JOIN public.sales_orders so
  ON r.description = 'Collection for sale ' || so.order_number
WHERE r.status = 'recorded'
ON CONFLICT (receipt_id) DO NOTHING;

INSERT INTO public.receipt_issuance_registry (
  receipt_number, receipt_id, receipt_year, sequence_number, issued_at, issued_by
)
SELECT
  r.receipt_number,
  r.id,
  substring(r.receipt_number FROM '^AMCOMS-([0-9]{4})-[0-9]{6}$')::INTEGER,
  substring(r.receipt_number FROM '^AMCOMS-[0-9]{4}-([0-9]{6})$')::BIGINT,
  r.created_at,
  r.created_by
FROM public.cash_receipts r
WHERE r.status = 'recorded'
  AND r.receipt_number ~ '^AMCOMS-[0-9]{4}-[0-9]{6}$'
ON CONFLICT (receipt_number) DO NOTHING;

ALTER TABLE public.cash_receipts
  ALTER COLUMN receipt_number DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

UPDATE public.cash_receipts
SET receipt_number = NULL
WHERE status = 'draft';

UPDATE public.cash_receipts
SET issued_at = COALESCE(issued_at, created_at),
    issued_by = COALESCE(issued_by, created_by)
WHERE receipt_number IS NOT NULL
  AND status = 'recorded';

ALTER TABLE public.savings_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'void')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.loan_payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'void')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.member_capital_contributions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'void')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.member_activity
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.member_capital_contributions
  DROP CONSTRAINT IF EXISTS member_capital_contributions_member_id_due_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS member_capital_contributions_active_month_idx
  ON public.member_capital_contributions (member_id, due_month)
  WHERE status = 'recorded';

ALTER TABLE public.receipt_issuance_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_receipt_sales_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_number_counters, public.receipt_issuance_registry,
  public.cash_receipt_sales_collections FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cash_receipts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_cooperative_receipt_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (clock_timestamp() AT TIME ZONE 'Asia/Manila'))::INTEGER;
  v_next BIGINT;
BEGIN
  INSERT INTO public.receipt_number_counters (receipt_year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (receipt_year)
  DO UPDATE SET last_number = public.receipt_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  IF v_next > 999999 THEN
    RAISE EXCEPTION 'The receipt sequence for % is exhausted', v_year;
  END IF;

  RETURN 'AMCOMS-' || v_year::TEXT || '-' || lpad(v_next::TEXT, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_cooperative_receipt_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_issued_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL
     AND (NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.issued_by IS DISTINCT FROM OLD.issued_by) THEN
    RAISE EXCEPTION 'An issued receipt number and its issuance details cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_issued_receipt_number ON public.cash_receipts;
CREATE TRIGGER protect_issued_receipt_number
  BEFORE UPDATE OF receipt_number, issued_at, issued_by ON public.cash_receipts
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_receipt_number();

ALTER FUNCTION public.save_cash_receipt(JSONB, JSONB) RENAME TO save_cash_receipt_before_auto_number;
REVOKE ALL ON FUNCTION public.save_cash_receipt_before_auto_number(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_cash_receipt(p_receipt JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT := COALESCE(p_receipt->>'status', 'recorded');
  v_receipt_number TEXT;
  v_receipt_id UUID;
  v_journal_id UUID;
  v_issued_at TIMESTAMPTZ;
  v_staff_id UUID := public.current_staff_id();
  v_result JSONB;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash receipts';
  END IF;

  IF v_status NOT IN ('draft', 'recorded') THEN
    RAISE EXCEPTION 'Unsupported receipt status';
  END IF;

  IF v_status = 'recorded' THEN
    v_receipt_number := public.next_cooperative_receipt_number();
    v_issued_at := clock_timestamp();
  ELSE
    v_receipt_number := 'DRAFT-' || replace(gen_random_uuid()::TEXT, '-', '');
  END IF;

  v_result := public.save_cash_receipt_before_auto_number(
    p_receipt || jsonb_build_object('receipt_number', v_receipt_number),
    p_allocations
  );
  v_receipt_id := (v_result->>'receipt_id')::UUID;
  v_journal_id := (v_result->>'journal_entry_id')::UUID;

  IF v_status = 'recorded' THEN
    UPDATE public.cash_receipts
    SET issued_at = v_issued_at,
        issued_by = v_staff_id
    WHERE id = v_receipt_id;

    INSERT INTO public.receipt_issuance_registry (
      receipt_number, receipt_id, receipt_year, sequence_number, issued_at, issued_by
    ) VALUES (
      v_receipt_number,
      v_receipt_id,
      substring(v_receipt_number FROM '^AMCOMS-([0-9]{4})-[0-9]{6}$')::INTEGER,
      substring(v_receipt_number FROM '^AMCOMS-[0-9]{4}-([0-9]{6})$')::BIGINT,
      v_issued_at,
      v_staff_id
    );
  ELSE
    UPDATE public.cash_receipts
    SET receipt_number = NULL,
        reference_number = NULL
    WHERE id = v_receipt_id;
    UPDATE public.journal_entries
    SET reference_number = NULL
    WHERE id = v_journal_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'receipt_number', CASE WHEN v_status = 'recorded' THEN v_receipt_number ELSE NULL END,
    'issued_at', v_issued_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_cash_receipt(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_receipt(JSONB, JSONB) TO authenticated;

ALTER FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB)
  RENAME TO record_member_financial_entry_before_auto_receipt;
REVOKE ALL ON FUNCTION public.record_member_financial_entry_before_auto_receipt(JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_member_financial_entry(
  p_receipt JSONB,
  p_disbursement JSONB,
  p_entry JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_internal_reference TEXT;
  v_receipt_payload JSONB;
  v_result JSONB;
  v_receipt_id UUID;
  v_receipt_number TEXT;
  v_entry_type TEXT := p_entry->>'entry_type';
BEGIN
  IF p_receipt IS NULL THEN
    RETURN public.record_member_financial_entry_before_auto_receipt(
      p_receipt, p_disbursement, p_entry
    );
  END IF;

  v_internal_reference := 'INTERNAL-' || replace(gen_random_uuid()::TEXT, '-', '');
  v_receipt_payload := p_receipt || jsonb_build_object('receipt_number', v_internal_reference);
  v_result := public.record_member_financial_entry_before_auto_receipt(
    v_receipt_payload, p_disbursement, p_entry
  );
  v_receipt_id := (v_result->>'receipt_id')::UUID;
  SELECT receipt_number INTO v_receipt_number
  FROM public.cash_receipts
  WHERE id = v_receipt_id;

  IF v_entry_type IN ('savings_deposit', 'time_deposit') THEN
    UPDATE public.savings_transactions
    SET reference_number = v_receipt_number
    WHERE receipt_id = v_receipt_id;
    DELETE FROM public.member_activity
    WHERE reference = v_receipt_number
      AND member_id = (p_receipt->>'member_id')::UUID
      AND activity_type = 'receipt';
  ELSIF v_entry_type = 'capital_contribution' THEN
    UPDATE public.member_activity
    SET activity_type = 'capital_contribution',
        title = 'Capital share contribution'
    WHERE reference = v_receipt_number
      AND activity_type = 'receipt';
  END IF;

  RETURN v_result || jsonb_build_object('receipt_number', v_receipt_number);
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) TO authenticated;

ALTER FUNCTION public.record_cooperative_sale(JSONB)
  RENAME TO record_cooperative_sale_before_auto_receipt;
REVOKE ALL ON FUNCTION public.record_cooperative_sale_before_auto_receipt(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_cooperative_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_receipt_id UUID;
  v_receipt_number TEXT;
  v_flow TEXT := p_sale->>'flow';
BEGIN
  v_result := public.record_cooperative_sale_before_auto_receipt(p_sale);
  v_receipt_id := NULLIF(v_result->>'cash_receipt_id', '')::UUID;

  IF v_receipt_id IS NOT NULL THEN
    SELECT receipt_number INTO v_receipt_number
    FROM public.cash_receipts
    WHERE id = v_receipt_id;
  END IF;

  IF v_flow = 'collection' AND v_receipt_id IS NOT NULL THEN
    INSERT INTO public.cash_receipt_sales_collections (
      receipt_id, sales_order_id, amount
    ) VALUES (
      v_receipt_id,
      (p_sale->>'sales_order_id')::UUID,
      (p_sale->>'amount')::NUMERIC(15, 2)
    );
  END IF;

  RETURN v_result || jsonb_build_object('receipt_number', v_receipt_number);
END;
$$;

REVOKE ALL ON FUNCTION public.record_cooperative_sale(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cooperative_sale(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_cash_receipt(p_receipt_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt RECORD;
  v_journal RECORD;
  v_savings RECORD;
  v_payment RECORD;
  v_schedule RECORD;
  v_capital NUMERIC(15, 2);
  v_left NUMERIC(15, 2);
  v_take NUMERIC(15, 2);
  v_reversal_id UUID;
  v_sale_order RECORD;
  v_sale_item RECORD;
  v_sale_movement RECORD;
  v_collection RECORD;
  v_stock RECORD;
  v_returned_quantity INTEGER;
  v_return_quantity INTEGER;
  v_unit_cost NUMERIC(15, 4);
  v_staff_id UUID := public.current_staff_id();
  v_reason TEXT := trim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can void cash receipts';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to void a cash receipt';
  END IF;
  IF length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'The void reason must be 1000 characters or fewer';
  END IF;

  SELECT * INTO v_receipt
  FROM public.cash_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash receipt not found';
  END IF;
  IF v_receipt.status = 'void' THEN
    RETURN jsonb_build_object(
      'voided', true,
      'receipt_number', v_receipt.receipt_number,
      'void_reason', v_receipt.void_reason,
      'already_void', true
    );
  END IF;

  IF v_receipt.journal_entry_id IS NOT NULL THEN
    SELECT status, reversed_by_entry_id INTO v_journal
    FROM public.journal_entries
    WHERE id = v_receipt.journal_entry_id
    FOR UPDATE;
    IF FOUND AND v_journal.status = 'posted' AND v_journal.reversed_by_entry_id IS NULL THEN
      v_reversal_id := public._reverse_journal_entry(
        v_receipt.journal_entry_id, v_reason, v_staff_id
      );
    ELSIF FOUND AND v_journal.status = 'draft' THEN
      UPDATE public.journal_entries
      SET status = 'void',
          reversal_reason = v_reason,
          reversed_by = v_staff_id,
          reversed_at = clock_timestamp()
      WHERE id = v_receipt.journal_entry_id;
    ELSE
      v_reversal_id := v_journal.reversed_by_entry_id;
    END IF;
  END IF;

  SELECT * INTO v_collection
  FROM public.cash_receipt_sales_collections
  WHERE receipt_id = v_receipt.id
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_sale_order
    FROM public.sales_orders
    WHERE id = v_collection.sales_order_id
    FOR UPDATE;
    IF NOT FOUND OR v_sale_order.payment_status = 'cancelled'
       OR COALESCE(v_sale_order.amount_paid, 0) < v_collection.amount THEN
      RAISE EXCEPTION 'The credit sale balance no longer matches this receipt; resolve it before voiding.';
    END IF;

    UPDATE public.sales_orders
    SET amount_paid = amount_paid - v_collection.amount,
        payment_status = CASE
          WHEN amount_paid - v_collection.amount <= 0 THEN 'pending'
          WHEN amount_paid - v_collection.amount >= net_amount THEN 'paid'
          ELSE 'partial'
        END,
        updated_at = clock_timestamp()
    WHERE id = v_sale_order.id;
  ELSE
    SELECT * INTO v_sale_order
    FROM public.sales_orders
    WHERE cash_receipt_id = v_receipt.id
    FOR UPDATE;
    IF FOUND THEN
      FOR v_sale_item IN
        SELECT product_id, quantity
        FROM public.sales_order_items
        WHERE sales_order_id = v_sale_order.id AND product_id IS NOT NULL
      LOOP
        SELECT * INTO v_sale_movement
        FROM public.stock_movements
        WHERE movement_type = 'sale'
          AND reference_number = v_sale_order.order_number
          AND product_id = v_sale_item.product_id
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN
          SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO v_returned_quantity
          FROM public.stock_movements
          WHERE movement_type = 'return'
            AND reference_number = v_sale_order.order_number
            AND product_id = v_sale_item.product_id;
          v_return_quantity := v_sale_item.quantity - v_returned_quantity;
          IF v_return_quantity > 0 THEN
            v_unit_cost := COALESCE(
              v_sale_movement.total_cost / NULLIF(v_sale_movement.quantity, 0),
              v_sale_movement.unit_cost
            );
            IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
              RAISE EXCEPTION 'The sale inventory cost is missing; resolve it before voiding this receipt.';
            END IF;

            SELECT * INTO v_stock
            FROM public.stock_inventory
            WHERE product_id = v_sale_item.product_id
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE;
            IF FOUND THEN
              UPDATE public.stock_inventory
              SET quantity_on_hand = quantity_on_hand + v_return_quantity,
                  last_restock_date = CURRENT_DATE,
                  updated_at = clock_timestamp()
              WHERE id = v_stock.id;
            ELSE
              INSERT INTO public.stock_inventory (product_id, quantity_on_hand, last_restock_date)
              VALUES (v_sale_item.product_id, v_return_quantity, CURRENT_DATE);
            END IF;

            INSERT INTO public.stock_movements (
              product_id, movement_type, quantity, unit_cost, reference_number,
              movement_date, description, created_by
            ) VALUES (
              v_sale_item.product_id, 'return', v_return_quantity, v_unit_cost,
              v_sale_order.order_number, CURRENT_DATE,
              'Inventory returned when voiding receipt ' || v_receipt.receipt_number,
              v_staff_id
            );
          END IF;
        END IF;
      END LOOP;

      UPDATE public.sales_orders
      SET payment_status = 'cancelled',
          order_status = 'cancelled',
          amount_paid = 0,
          updated_at = clock_timestamp()
      WHERE id = v_sale_order.id;
    END IF;
  END IF;

  FOR v_savings IN
    SELECT * FROM public.savings_transactions
    WHERE receipt_id = v_receipt.id AND status = 'recorded'
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.savings_transactions later
      WHERE later.savings_account_id = v_savings.savings_account_id
        AND later.status = 'recorded'
        AND later.id <> v_savings.id
        AND later.created_at > v_savings.created_at
    ) THEN
      RAISE EXCEPTION 'Void later account transactions first; they depend on this receipt.';
    END IF;
    UPDATE public.savings_accounts
    SET balance = balance - CASE
      WHEN v_savings.transaction_type = 'withdrawal' THEN -v_savings.amount
      ELSE v_savings.amount
    END,
    updated_at = now()
    WHERE id = v_savings.savings_account_id;
    UPDATE public.savings_transactions
    SET status = 'void',
        voided_at = clock_timestamp(),
        voided_by = v_staff_id,
        void_reason = v_reason
    WHERE id = v_savings.id;
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_capital
  FROM public.member_capital_contributions
  WHERE receipt_id = v_receipt.id AND status = 'recorded';
  IF v_capital > 0 AND v_receipt.member_id IS NOT NULL THEN
    UPDATE public.members
    SET total_capital = GREATEST(COALESCE(total_capital, 0) - v_capital, 0)
    WHERE id = v_receipt.member_id;
    UPDATE public.member_capital_contributions
    SET status = 'void',
        voided_at = clock_timestamp(),
        voided_by = v_staff_id,
        void_reason = v_reason
    WHERE receipt_id = v_receipt.id AND status = 'recorded';
    UPDATE public.member_activity
    SET title = 'VOIDED — ' || title,
        voided_at = clock_timestamp(),
        voided_by = v_staff_id,
        void_reason = v_reason
    WHERE member_id = v_receipt.member_id
      AND reference = v_receipt.receipt_number
      AND activity_type = 'capital_contribution'
      AND voided_at IS NULL;
  END IF;

  FOR v_payment IN
    SELECT * FROM public.loan_payments
    WHERE receipt_id = v_receipt.id AND status = 'recorded'
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.loan_payments later
      WHERE later.loan_id = v_payment.loan_id
        AND later.status = 'recorded'
        AND later.id <> v_payment.id
        AND later.created_at > v_payment.created_at
    ) THEN
      RAISE EXCEPTION 'Void later loan payments first; they depend on this receipt.';
    END IF;

    v_left := v_payment.amount_paid;
    FOR v_schedule IN
      SELECT * FROM public.loan_schedule
      WHERE loan_id = v_payment.loan_id AND amount_paid > 0
      ORDER BY installment_number DESC
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, v_schedule.amount_paid);
      UPDATE public.loan_schedule
      SET amount_paid = amount_paid - v_take,
          status = CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
          paid_at = NULL
      WHERE id = v_schedule.id;
      v_left := v_left - v_take;
    END LOOP;

    UPDATE public.loans
    SET balance = LEAST(balance + COALESCE(v_payment.principal_paid, 0), total_amount),
        status = 'active',
        updated_at = now()
    WHERE id = v_payment.loan_id;
    UPDATE public.loan_payments
    SET status = 'void',
        voided_at = clock_timestamp(),
        voided_by = v_staff_id,
        void_reason = v_reason
    WHERE id = v_payment.id;
  END LOOP;

  UPDATE public.member_activity
  SET title = 'VOIDED — ' || title,
      voided_at = clock_timestamp(),
      voided_by = v_staff_id,
      void_reason = v_reason
  WHERE reference = v_receipt.receipt_number
    AND (v_receipt.member_id IS NULL OR member_id = v_receipt.member_id)
    AND voided_at IS NULL;

  UPDATE public.data_discrepancies
  SET status = 'resolved',
      resolved_by = v_staff_id,
      resolved_at = clock_timestamp()
  WHERE source_type = 'cash_receipt'
    AND source_id = v_receipt.id
    AND status = 'open';

  UPDATE public.cash_receipts
  SET status = 'void',
      voided_at = clock_timestamp(),
      voided_by = v_staff_id,
      void_reason = v_reason
  WHERE id = v_receipt.id;

  UPDATE public.receipt_issuance_registry
  SET voided_at = clock_timestamp(),
      voided_by = v_staff_id,
      void_reason = v_reason
  WHERE receipt_id = v_receipt.id;

  RETURN jsonb_build_object(
    'voided', true,
    'receipt_number', v_receipt.receipt_number,
    'reversal_journal_entry_id', v_reversal_id,
    'void_reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_cash_receipt(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_cash_receipt(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_cash_receipt(p_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.void_cash_receipt(p_receipt_id, 'Voided through the legacy transaction-delete action.');
END;
$$;
REVOKE ALL ON FUNCTION public.delete_cash_receipt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cash_receipt(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.data_discrepancy_scan
WITH (security_invoker = true) AS
SELECT 'loan:' || l.id AS id, l.member_id, 'Loan balance' AS category,
       'Loan ' || l.loan_number || ' shows a balance of ' || to_char(l.balance, 'FM999,999,990.00')
         || ' but its total and recorded payments imply ' || to_char(l.total_amount - COALESCE(p.paid, 0), 'FM999,999,990.00') || '.' AS reason,
       l.loan_number AS reference, l.created_at AS detected_at
FROM public.loans l
LEFT JOIN (
  SELECT loan_id, SUM(amount_paid) AS paid
  FROM public.loan_payments
  WHERE status = 'recorded'
  GROUP BY loan_id
) p ON p.loan_id = l.id
WHERE l.status IN ('active', 'completed')
  AND abs(l.balance - GREATEST(l.total_amount - COALESCE(p.paid, 0), 0)) > 0.01
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

GRANT SELECT ON public.data_discrepancy_scan TO authenticated;

COMMIT;

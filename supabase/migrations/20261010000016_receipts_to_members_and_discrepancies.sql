-- Member activity flags
ALTER TABLE public.member_activity
  ADD COLUMN IF NOT EXISTS is_discrepancy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Event-based discrepancies raised when a transaction is recorded
CREATE TABLE IF NOT EXISTS public.data_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id UUID,
  reference TEXT,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount NUMERIC(15, 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.data_discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view discrepancies" ON public.data_discrepancies;
CREATE POLICY "Staff can view discrepancies" ON public.data_discrepancies
  FOR SELECT USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

DROP POLICY IF EXISTS "Staff can resolve discrepancies" ON public.data_discrepancies;
CREATE POLICY "Staff can resolve discrepancies" ON public.data_discrepancies
  FOR UPDATE USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']))
  WITH CHECK (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'data_discrepancies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.data_discrepancies;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS data_discrepancies_status_idx ON public.data_discrepancies (status, created_at DESC);

-- Receipts can now be linked to a member
-- Applies a recorded receipt to the member: loan payments reduce the loan, everything is mirrored to member_activity
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
BEGIN
  SELECT * INTO r FROM public.cash_receipts WHERE id = p_receipt_id;
  IF NOT FOUND OR r.status <> 'recorded' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.member_activity WHERE reference = r.receipt_number AND activity_type IN ('loan_payment', 'receipt'))
     OR EXISTS (SELECT 1 FROM public.data_discrepancies WHERE source_type = 'cash_receipt' AND source_id = r.id) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.cash_receipt_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.cash_receipt_id = r.id AND a.account_name = 'Loan Receivable' AND l.side = 'credit'
  ) OR COALESCE(r.description, '') ~* 'loan' INTO v_is_loan_payment;

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
  ORDER BY release_date NULLS LAST, created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_reason := 'Loan payment of ' || to_char(r.amount, 'FM999,999,990.00') || ' was recorded but the member has no active loan to apply it to.';
    INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by, is_discrepancy, note)
    VALUES (r.member_id, 'loan_payment', 'Loan payment (discrepancy)', r.amount, r.receipt_number, r.created_by, true, v_reason);
    INSERT INTO public.data_discrepancies (member_id, source_type, source_id, reference, category, reason, amount, created_by)
    VALUES (r.member_id, 'cash_receipt', r.id, r.receipt_number, 'Loan payment', v_reason, r.amount, r.created_by);
    RETURN;
  END IF;

  v_apply := LEAST(r.amount, v_loan.balance);
  SELECT COALESCE(MAX(payment_number), 0) + 1 INTO v_next FROM public.loan_payments WHERE loan_id = v_loan.id;

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

REVOKE ALL ON FUNCTION public.process_member_receipt(UUID) FROM PUBLIC, anon, authenticated;

-- Live data checks across portals (evaluated on every read, respects RLS of the caller)
CREATE OR REPLACE VIEW public.data_discrepancy_scan
WITH (security_invoker = true) AS
SELECT 'loan:' || l.id AS id, l.member_id, 'Loan balance' AS category,
       'Loan ' || l.loan_number || ' shows a balance of ' || to_char(l.balance, 'FM999,999,990.00')
         || ' but its total and recorded payments imply ' || to_char(l.total_amount - COALESCE(p.paid, 0), 'FM999,999,990.00') || '.' AS reason,
       l.loan_number AS reference, l.created_at AS detected_at
FROM public.loans l
LEFT JOIN (SELECT loan_id, SUM(amount_paid) AS paid FROM public.loan_payments GROUP BY loan_id) p ON p.loan_id = l.id
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
  FROM public.savings_transactions GROUP BY savings_account_id
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
JOIN (SELECT journal_entry_id, SUM(debit_amount) AS d, SUM(credit_amount) AS c FROM public.journal_entry_lines GROUP BY journal_entry_id) x
  ON x.journal_entry_id = j.id
WHERE j.status = 'posted' AND abs(x.d - x.c) > 0.01;

GRANT SELECT ON public.data_discrepancy_scan TO authenticated;

-- Receipt save: accepts member_id and applies the receipt to the member
CREATE OR REPLACE FUNCTION public.save_cash_receipt(p_receipt JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_status TEXT := COALESCE(p_receipt->>'status', 'recorded');
  v_amount NUMERIC(15, 2) := (p_receipt->>'amount')::NUMERIC(15, 2);
  v_debit_total NUMERIC(15, 2) := 0;
  v_credit_total NUMERIC(15, 2) := 0;
  v_journal_id UUID;
  v_receipt_id UUID;
  v_cash_account_id UUID;
  v_allocation JSONB;
  v_allocation_amount NUMERIC(15, 2);
  v_account_id UUID;
  v_receipt_number TEXT := trim(p_receipt->>'receipt_number');
  v_member_id UUID := NULLIF(p_receipt->>'member_id', '')::UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash receipts';
  END IF;

  IF v_status NOT IN ('draft', 'recorded') THEN
    RAISE EXCEPTION 'Unsupported receipt status';
  END IF;
  IF v_receipt_number IS NULL OR v_receipt_number = '' THEN
    RAISE EXCEPTION 'Receipt number is required';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount received must be greater than zero';
  END IF;
  IF COALESCE(trim(p_receipt->>'received_from'), '') = '' OR COALESCE(trim(p_receipt->>'description'), '') = '' THEN
    RAISE EXCEPTION 'Member/customer and particulars are required';
  END IF;
  IF COALESCE(p_receipt->>'payment_method', '') NOT IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF v_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.members WHERE id = v_member_id) THEN
    RAISE EXCEPTION 'Selected member does not exist';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Account allocations must be an array';
  END IF;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_allocation_amount := (v_allocation->>'amount')::NUMERIC(15, 2);
    IF COALESCE(trim(v_allocation->>'account'), '') = '' OR v_allocation_amount IS NULL OR v_allocation_amount <= 0 THEN
      RAISE EXCEPTION 'Every allocation needs an account and a positive amount';
    END IF;
    IF COALESCE(v_allocation->>'side', '') NOT IN ('debit', 'credit') THEN
      RAISE EXCEPTION 'Every allocation needs a debit or credit side';
    END IF;

    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE account_name = v_allocation->>'account' AND is_active = true;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Account % is missing from the chart of accounts', v_allocation->>'account';
    END IF;

    IF v_allocation->>'side' = 'debit' THEN
      v_debit_total := v_debit_total + v_allocation_amount;
      IF v_cash_account_id IS NULL THEN v_cash_account_id := v_account_id; END IF;
    ELSE
      v_credit_total := v_credit_total + v_allocation_amount;
    END IF;
  END LOOP;

  IF v_status = 'recorded' THEN
    IF jsonb_array_length(p_allocations) < 2 THEN
      RAISE EXCEPTION 'A recorded receipt needs at least one debit and one credit allocation';
    END IF;
    IF abs(v_debit_total - v_credit_total) > 0.01 THEN
      RAISE EXCEPTION 'Debits and credits must balance';
    END IF;
    IF abs(v_debit_total - v_amount) > 0.01 THEN
      RAISE EXCEPTION 'Debit total must equal amount received';
    END IF;
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    'CR-' || v_receipt_number,
    (p_receipt->>'receipt_date')::DATE,
    trim(p_receipt->>'description'),
    v_receipt_number,
    'general',
    CASE WHEN v_status = 'recorded' THEN 'posted' ELSE 'draft' END,
    v_staff_id,
    CASE WHEN v_status = 'recorded' THEN v_staff_id ELSE NULL END,
    CASE WHEN v_status = 'recorded' THEN timezone('utc'::text, now()) ELSE NULL END
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.cash_receipts (
    receipt_number, receipt_date, received_from, member_id, amount, payment_method,
    reference_number, account_id, description, journal_entry_id, created_by, status
  ) VALUES (
    v_receipt_number,
    (p_receipt->>'receipt_date')::DATE,
    trim(p_receipt->>'received_from'),
    v_member_id,
    v_amount,
    p_receipt->>'payment_method',
    v_receipt_number,
    v_cash_account_id,
    trim(p_receipt->>'description'),
    v_journal_id,
    v_staff_id,
    v_status
  ) RETURNING id INTO v_receipt_id;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_allocation_amount := (v_allocation->>'amount')::NUMERIC(15, 2);
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE account_name = v_allocation->>'account' AND is_active = true;

    INSERT INTO public.cash_receipt_lines (cash_receipt_id, account_id, amount, description, side)
    VALUES (v_receipt_id, v_account_id, v_allocation_amount, trim(p_receipt->>'description'), v_allocation->>'side');

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (
      v_journal_id,
      v_account_id,
      CASE WHEN v_allocation->>'side' = 'debit' THEN v_allocation_amount ELSE 0 END,
      CASE WHEN v_allocation->>'side' = 'credit' THEN v_allocation_amount ELSE 0 END,
      trim(p_receipt->>'description')
    );
  END LOOP;

  IF v_status = 'recorded' THEN
    PERFORM public.process_member_receipt(v_receipt_id);
  END IF;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'journal_entry_id', v_journal_id, 'status', v_status);
END;
$$;

-- Link the already recorded receipt for rolan salva and apply it
UPDATE public.cash_receipts r
SET member_id = m.id
FROM public.members m
WHERE r.member_id IS NULL
  AND lower(trim(r.received_from)) IN (
    lower(trim(concat_ws(' ', m.first_name, m.middle_name, m.last_name))),
    lower(trim(concat_ws(' ', m.first_name, m.last_name)))
  );

SELECT public.process_member_receipt(id) FROM public.cash_receipts WHERE status = 'recorded';

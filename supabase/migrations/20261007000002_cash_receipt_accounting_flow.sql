ALTER TABLE public.cash_receipts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded';
ALTER TABLE public.cash_receipt_lines
  ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'credit';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_receipts_status_check'
      AND conrelid = 'public.cash_receipts'::regclass
  ) THEN
    ALTER TABLE public.cash_receipts
      ADD CONSTRAINT cash_receipts_status_check
      CHECK (status IN ('draft', 'recorded', 'void'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_receipt_lines_side_check'
      AND conrelid = 'public.cash_receipt_lines'::regclass
  ) THEN
    ALTER TABLE public.cash_receipt_lines
      ADD CONSTRAINT cash_receipt_lines_side_check
      CHECK (side IN ('debit', 'credit'));
  END IF;
END;
$$;
WITH account_seed(account_code, account_name, account_type) AS (
  VALUES
    ('CR-CASH-HAND', 'Cash on Hand', 'asset'),
    ('CR-CASH-BANK', 'Cash in Bank', 'asset'),
    ('CR-AR', 'Account Receivable', 'asset'),
    ('CR-LOAN-REC', 'Loan Receivable', 'asset'),
    ('CR-SAVINGS-TD', 'Savings / Time Deposit', 'liability'),
    ('CR-CAPITAL', 'Capital Share', 'equity'),
    ('CR-SALES', 'Sales', 'revenue'),
    ('CR-CHARGE-SALES', 'Charge Sales', 'revenue'),
    ('CR-MARKETING', 'Marketing', 'revenue'),
    ('CR-BFT', 'Barangay Food Terminal (BFT)', 'revenue'),
    ('CR-MEMBERSHIP-FEE', 'Membership Fee', 'revenue'),
    ('CR-INTEREST-INCOME', 'Interest Income', 'revenue'),
    ('CR-SERVICE-FEE', 'Service Fee Income', 'revenue'),
    ('CR-OTHER-INCOME', 'Other Income', 'revenue')
)
INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, is_active)
SELECT seed.account_code, seed.account_name, seed.account_type, 'Cash Receipt', true
FROM account_seed seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts existing
  WHERE lower(existing.account_name) = lower(seed.account_name)
)
ON CONFLICT (account_code) DO NOTHING;
CREATE OR REPLACE FUNCTION public.save_cash_receipt(
  p_receipt JSONB,
  p_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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
    receipt_number, receipt_date, received_from, amount, payment_method,
    reference_number, account_id, description, journal_entry_id, created_by, status
  ) VALUES (
    v_receipt_number,
    (p_receipt->>'receipt_date')::DATE,
    trim(p_receipt->>'received_from'),
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

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'journal_entry_id', v_journal_id, 'status', v_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_cash_receipt(JSONB, JSONB) TO authenticated;

ALTER TABLE public.cash_disbursements
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded';
WITH account_seed(account_code, account_name, account_type) AS (
  VALUES
    ('CD-OFFICE-SUPPLIES', 'Office Supplies', 'expense'),
    ('CD-GASOLINE', 'Gasoline', 'expense'),
    ('CD-SALARY', 'Salary', 'expense'),
    ('CD-LOAN-PAYABLE', 'Loan Payable', 'liability'),
    ('CD-ACCOUNT-PAYABLE', 'Account Payable', 'liability'),
    ('CD-PURCHASES-COCOSUGAR', 'Purchases/Cocosugar', 'expense'),
    ('CD-BFT', 'BFT', 'expense'),
    ('CD-MISCELLANEOUS', 'Miscellaneous', 'expense'),
    ('CD-MAYORS-PERMIT', 'Mayor''s Permit', 'expense'),
    ('CD-MAINTENANCE', 'Maintenance', 'expense'),
    ('CD-SHIPMENT-FEE', 'Shipment Fee', 'expense'),
    ('CD-REPRESENTATION', 'Representation', 'expense'),
    ('CD-LIGHT-WATER', 'Light/Water', 'expense'),
    ('CD-INSURANCE', 'Insurance', 'expense'),
    ('CD-INTEREST-EXPENSES', 'Interest Expenses', 'expense'),
    ('CD-EQUIPMENT', 'Equipment', 'asset'),
    ('CD-BUILDING-IMPROVEMENTS', 'Building Improvements', 'asset'),
    ('CD-CETF', 'CETF', 'expense'),
    ('CD-MILITARY-AID', 'Military Aid', 'expense'),
    ('CD-LABOR-FEE', 'Labor Fee', 'expense'),
    ('CD-TRAVELING-ALLOWANCE', 'Traveling Allowance', 'expense'),
    ('CD-INTERNET', 'Internet', 'expense'),
    ('CD-PROFESSIONAL-FEE', 'Professional Fee', 'expense'),
    ('CD-COMMUNICATION', 'Communication', 'expense'),
    ('CD-TAXES-LICENSES', 'Taxes and Licenses', 'expense'),
    ('CD-MEMBERSHIP-DUES', 'Membership Dues', 'expense'),
    ('CD-TRAINING', 'Training and Seminars', 'expense'),
    ('CD-BANK-CHARGES', 'Bank Charges', 'expense'),
    ('CD-DEPRECIATION', 'Depreciation', 'expense'),
    ('CD-OTHER-EXPENSES', 'Other Expenses', 'expense')
)
INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, is_active)
SELECT seed.account_code, seed.account_name, seed.account_type, 'Cash Disbursement', true
FROM account_seed seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts existing
  WHERE lower(existing.account_name) = lower(seed.account_name)
)
ON CONFLICT (account_code) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_disbursements_status_check'
      AND conrelid = 'public.cash_disbursements'::regclass
  ) THEN
    ALTER TABLE public.cash_disbursements
      ADD CONSTRAINT cash_disbursements_status_check
      CHECK (status IN ('draft', 'recorded', 'void'));
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_cash_disbursement(
  p_disbursement JSONB,
  p_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_status TEXT := COALESCE(p_disbursement->>'status', 'recorded');
  v_amount NUMERIC(15, 2) := (p_disbursement->>'amount')::NUMERIC(15, 2);
  v_allocation_total NUMERIC(15, 2) := 0;
  v_journal_id UUID;
  v_disbursement_id UUID;
  v_cash_account_id UUID;
  v_allocation JSONB;
  v_allocation_amount NUMERIC(15, 2);
  v_account_id UUID;
  v_voucher_number TEXT := trim(p_disbursement->>'voucher_number');
  v_cash_account_name TEXT;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash disbursements';
  END IF;
  IF v_status NOT IN ('draft', 'recorded') THEN
    RAISE EXCEPTION 'Unsupported disbursement status';
  END IF;
  IF v_voucher_number IS NULL OR v_voucher_number = '' THEN
    RAISE EXCEPTION 'Voucher number is required';
  END IF;
  IF COALESCE(trim(p_disbursement->>'payee'), '') = '' OR COALESCE(trim(p_disbursement->>'description'), '') = '' THEN
    RAISE EXCEPTION 'Payee and particulars are required';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF COALESCE(p_disbursement->>'payment_source', '') NOT IN ('cash-on-hand', 'cash-in-bank') THEN
    RAISE EXCEPTION 'Unsupported payment source';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Account allocations must be an array';
  END IF;

  v_cash_account_name := CASE p_disbursement->>'payment_source'
    WHEN 'cash-on-hand' THEN 'Cash on Hand'
    ELSE 'Cash in Bank'
  END;
  SELECT id INTO v_cash_account_id
  FROM public.chart_of_accounts
  WHERE account_name = v_cash_account_name AND is_active = true;
  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Account % is missing from the chart of accounts', v_cash_account_name;
  END IF;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_allocation_amount := (v_allocation->>'amount')::NUMERIC(15, 2);
    IF COALESCE(trim(v_allocation->>'account'), '') = '' OR v_allocation_amount IS NULL OR v_allocation_amount <= 0 THEN
      RAISE EXCEPTION 'Every allocation needs an account and a positive amount';
    END IF;
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE account_name = v_allocation->>'account' AND is_active = true;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Account % is missing from the chart of accounts', v_allocation->>'account';
    END IF;
    v_allocation_total := v_allocation_total + v_allocation_amount;
  END LOOP;

  IF v_status = 'recorded' AND (jsonb_array_length(p_allocations) = 0 OR abs(v_allocation_total - v_amount) > 0.01) THEN
    RAISE EXCEPTION 'Allocation total must equal payment amount';
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    'CD-' || v_voucher_number,
    (p_disbursement->>'disbursement_date')::DATE,
    trim(p_disbursement->>'description'),
    v_voucher_number,
    'general',
    CASE WHEN v_status = 'recorded' THEN 'posted' ELSE 'draft' END,
    v_staff_id,
    CASE WHEN v_status = 'recorded' THEN v_staff_id ELSE NULL END,
    CASE WHEN v_status = 'recorded' THEN timezone('utc'::text, now()) ELSE NULL END
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.cash_disbursements (
    voucher_number, disbursement_date, payee, amount, payment_method,
    reference_number, account_id, description, journal_entry_id, created_by, status
  ) VALUES (
    v_voucher_number,
    (p_disbursement->>'disbursement_date')::DATE,
    trim(p_disbursement->>'payee'),
    v_amount,
    CASE WHEN p_disbursement->>'payment_source' = 'cash-on-hand' THEN 'cash' ELSE 'bank_transfer' END,
    v_voucher_number,
    v_cash_account_id,
    trim(p_disbursement->>'description'),
    v_journal_id,
    v_staff_id,
    v_status
  ) RETURNING id INTO v_disbursement_id;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_allocation_amount := (v_allocation->>'amount')::NUMERIC(15, 2);
    SELECT id INTO v_account_id
    FROM public.chart_of_accounts
    WHERE account_name = v_allocation->>'account' AND is_active = true;

    INSERT INTO public.cash_disbursement_lines (cash_disbursement_id, account_id, amount, description)
    VALUES (v_disbursement_id, v_account_id, v_allocation_amount, trim(p_disbursement->>'description'));

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_journal_id, v_account_id, v_allocation_amount, 0, trim(p_disbursement->>'description'));
  END LOOP;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (v_journal_id, v_cash_account_id, 0, v_amount, trim(p_disbursement->>'description'));

  RETURN jsonb_build_object('disbursement_id', v_disbursement_id, 'journal_entry_id', v_journal_id, 'status', v_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) TO authenticated;

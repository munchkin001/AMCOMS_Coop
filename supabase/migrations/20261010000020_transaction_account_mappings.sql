-- Accounting treatment per transaction type, server-side posting validation,
-- duplicate-submission protection and source-document links on the journal register.
-- Additive: no existing rows are modified.

-- 1. Reference table of how each cooperative transaction type is posted.
CREATE TABLE IF NOT EXISTS public.transaction_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document TEXT NOT NULL CHECK (document IN ('receipt', 'disbursement')),
  transaction_type TEXT NOT NULL,
  label TEXT NOT NULL,
  counter_account_id UUID REFERENCES public.chart_of_accounts(id),
  counter_side TEXT NOT NULL CHECK (counter_side IN ('debit', 'credit')),
  member_effect TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document, transaction_type)
);

ALTER TABLE public.transaction_account_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Financial staff read mappings" ON public.transaction_account_mappings;
CREATE POLICY "Financial staff read mappings" ON public.transaction_account_mappings
  FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

REVOKE INSERT, UPDATE, DELETE ON public.transaction_account_mappings FROM authenticated, anon;
GRANT SELECT ON public.transaction_account_mappings TO authenticated;

INSERT INTO public.transaction_account_mappings
  (document, transaction_type, label, counter_account_id, counter_side, member_effect, notes, sort_order)
SELECT m.document, m.transaction_type, m.label, a.id, m.counter_side, m.member_effect, m.notes, m.sort_order
FROM (VALUES
  ('receipt', 'sales', 'Sales', 'Sales', 'credit', NULL, 'Revenue. Cash is debited.', 10),
  ('receipt', 'charge_sales', 'Charge sales', 'Charge Sales', 'credit', NULL, 'Revenue. Use Account Receivable as the debit when no cash is received.', 20),
  ('receipt', 'accounts_receivable', 'Collection of accounts receivable', 'Account Receivable', 'credit', NULL, 'Not revenue: reduces a receivable already recognised.', 30),
  ('receipt', 'loan_principal', 'Loan principal payment', 'Loan Receivable', 'credit', 'Reduces the member loan balance', 'Not revenue: reduces Loan Receivable.', 40),
  ('receipt', 'loan_interest', 'Loan interest', 'Interest Income', 'credit', NULL, 'Revenue.', 50),
  ('receipt', 'service_fee', 'Service fee', 'Service Fee Income', 'credit', NULL, 'Revenue.', 60),
  ('receipt', 'membership_fee', 'Membership fee', 'Membership Fee', 'credit', NULL, 'Revenue.', 70),
  ('receipt', 'savings_deposit', 'Savings deposit', 'Savings / Time Deposit', 'credit', 'Increases member savings', 'Not revenue: a liability owed to the member.', 80),
  ('receipt', 'time_deposit', 'Time deposit placement', 'Savings / Time Deposit', 'credit', 'Increases member time deposit', 'Not revenue: a liability owed to the member. Savings and time deposits share one account in the current chart.', 90),
  ('receipt', 'capital_share', 'Capital share contribution', 'Capital Share', 'credit', 'Increases member share capital', 'Not revenue: member equity.', 100),
  ('receipt', 'bft', 'Barangay Food Terminal', 'Barangay Food Terminal (BFT)', 'credit', NULL, 'Revenue.', 110),
  ('receipt', 'marketing', 'Marketing', 'Marketing', 'credit', NULL, 'Revenue.', 120),
  ('receipt', 'other_income', 'Other income', 'Other Income', 'credit', NULL, 'Revenue.', 130),
  ('disbursement', 'loan_release', 'Loan released to member', 'Loan Receivable', 'debit', 'Adds to the member loan balance', 'Asset: money the member owes the cooperative. Chosen as Loan Payable on the form and posted to Loan Receivable.', 10),
  ('disbursement', 'savings_withdrawal', 'Savings / time deposit withdrawal', 'Savings / Time Deposit', 'debit', 'Reduces member savings', 'Reduces the liability owed to the member. Not an expense.', 20),
  ('disbursement', 'accounts_payable', 'Payment of accounts payable', 'Account Payable', 'debit', NULL, 'Not an expense: settles a payable already recognised.', 30),
  ('disbursement', 'equipment', 'Equipment purchase', 'Equipment', 'debit', NULL, 'Asset, not an expense.', 40),
  ('disbursement', 'building_improvements', 'Building improvements', 'Building Improvements', 'debit', NULL, 'Asset, not an expense.', 50)
) AS m(document, transaction_type, label, account_name, counter_side, member_effect, notes, sort_order)
JOIN public.chart_of_accounts a ON a.account_name = m.account_name
ON CONFLICT (document, transaction_type) DO NOTHING;

-- 2. Posting rules enforced in the database.
CREATE OR REPLACE FUNCTION public._validate_cash_posting(p_document TEXT, p_allocations JSONB)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_alloc JSONB;
  v_acct RECORD;
  v_cash_debit BOOLEAN := false;
BEGIN
  FOR v_alloc IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT account_name, account_type INTO v_acct
    FROM public.chart_of_accounts
    WHERE account_name = v_alloc->>'account' AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % is missing from the chart of accounts', v_alloc->>'account';
    END IF;

    IF p_document = 'receipt' THEN
      IF v_alloc->>'side' = 'debit' AND v_acct.account_name IN ('Cash on Hand', 'Cash in Bank') THEN
        v_cash_debit := true;
      END IF;
      IF v_alloc->>'side' = 'credit' AND v_acct.account_type = 'expense' THEN
        RAISE EXCEPTION 'Not posted: a cash receipt cannot credit the expense account "%". Use Other Income or reverse the original expense.', v_acct.account_name;
      END IF;
    ELSE
      IF v_acct.account_name IN ('Cash on Hand', 'Cash in Bank') THEN
        RAISE EXCEPTION 'Not posted: a cash disbursement cannot be charged to "%". Record bank/cash transfers as a cash receipt.', v_acct.account_name;
      END IF;
      IF v_acct.account_type = 'revenue' THEN
        RAISE EXCEPTION 'Not posted: a cash disbursement cannot be charged to the revenue account "%".', v_acct.account_name;
      END IF;
    END IF;
  END LOOP;

  IF p_document = 'receipt' AND NOT v_cash_debit THEN
    RAISE EXCEPTION 'Not posted: a cash receipt must debit Cash on Hand or Cash in Bank for the money received.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._validate_cash_posting(TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- 3. Receipt: serialise duplicate submissions and validate treatment before the existing logic.
ALTER FUNCTION public.save_cash_receipt(JSONB, JSONB) RENAME TO save_cash_receipt_checked;
REVOKE ALL ON FUNCTION public.save_cash_receipt_checked(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_cash_receipt(p_receipt JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_number TEXT := trim(COALESCE(p_receipt->>'receipt_number', ''));
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash receipts';
  END IF;
  IF v_number = '' THEN
    RAISE EXCEPTION 'Receipt number is required';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Account allocations must be an array';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cash_receipt:' || v_number));
  IF EXISTS (SELECT 1 FROM public.cash_receipts WHERE receipt_number = v_number)
     OR EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number = 'CR-' || v_number) THEN
    RAISE EXCEPTION 'Not posted: receipt number % has already been used. Nothing was duplicated; use a new receipt number for a new transaction.', v_number;
  END IF;

  IF COALESCE(p_receipt->>'status', 'recorded') = 'recorded' THEN
    PERFORM public._validate_cash_posting('receipt', p_allocations);
  END IF;

  RETURN public.save_cash_receipt_checked(p_receipt, p_allocations);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cash_receipt(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_receipt(JSONB, JSONB) TO authenticated;

-- 4. Disbursement: same protections. A loan released to a member is an asset (Loan Receivable),
-- so repayments (credit Loan Receivable) net against it.
ALTER FUNCTION public.save_cash_disbursement(JSONB, JSONB) RENAME TO save_cash_disbursement_core;
REVOKE ALL ON FUNCTION public.save_cash_disbursement_core(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_cash_disbursement(p_disbursement JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_number TEXT := trim(COALESCE(p_disbursement->>'voucher_number', ''));
  v_allocations JSONB;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash disbursements';
  END IF;
  IF v_number = '' THEN
    RAISE EXCEPTION 'Voucher number is required';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Account allocations must be an array';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cash_disbursement:' || v_number));
  IF EXISTS (SELECT 1 FROM public.cash_disbursements WHERE voucher_number = v_number)
     OR EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number = 'CD-' || v_number) THEN
    RAISE EXCEPTION 'Not posted: voucher number % has already been used. Nothing was duplicated; use a new voucher number for a new transaction.', v_number;
  END IF;

  SELECT COALESCE(jsonb_agg(
           CASE WHEN a->>'account' = 'Loan Payable' THEN jsonb_set(a, '{account}', '"Loan Receivable"') ELSE a END
         ), '[]'::jsonb)
  INTO v_allocations
  FROM jsonb_array_elements(p_allocations) a;

  IF COALESCE(p_disbursement->>'status', 'recorded') = 'recorded' THEN
    PERFORM public._validate_cash_posting('disbursement', v_allocations);
  END IF;

  RETURN public.save_cash_disbursement_core(p_disbursement, v_allocations);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_disbursement(JSONB, JSONB) TO authenticated;

-- 5. Register shows the originating transaction. New columns are appended.
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
    WHEN EXISTS (SELECT 1 FROM public.cash_receipts r WHERE r.journal_entry_id = je.id) THEN 'Cash Receipt'
    WHEN EXISTS (SELECT 1 FROM public.cash_disbursements d WHERE d.journal_entry_id = je.id) THEN 'Cash Disbursement'
    WHEN je.reverses_entry_id IS NOT NULL THEN 'Reversal'
    ELSE 'Manual Entry'
  END AS source_type
FROM public.journal_entries je;

GRANT SELECT ON public.journal_entry_register TO authenticated;

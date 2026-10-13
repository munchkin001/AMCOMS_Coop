-- Keep member sub-ledgers and the cash books in sync for Bookkeeper entries.

ALTER TABLE public.cash_disbursements
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id);

CREATE TABLE IF NOT EXISTS public.member_capital_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id),
  due_month DATE NOT NULL CHECK (EXTRACT(DAY FROM due_month) = 1),
  amount NUMERIC(15, 2) NOT NULL DEFAULT 100.00 CHECK (amount = 100.00),
  receipt_id UUID NOT NULL REFERENCES public.cash_receipts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, due_month)
);

ALTER TABLE public.member_capital_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own capital contributions" ON public.member_capital_contributions;
CREATE POLICY "Members can view own capital contributions"
  ON public.member_capital_contributions FOR SELECT TO authenticated
  USING (member_id = public.get_member_id());

DROP POLICY IF EXISTS "Financial staff can view capital contributions" ON public.member_capital_contributions;
CREATE POLICY "Financial staff can view capital contributions"
  ON public.member_capital_contributions FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

REVOKE INSERT, UPDATE, DELETE ON public.member_capital_contributions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_capital_contributions TO authenticated;

CREATE OR REPLACE FUNCTION public._get_or_create_member_savings_account(
  p_member_id UUID,
  p_account_type TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account_id UUID;
  v_member_number TEXT;
  v_account_number TEXT;
BEGIN
  IF p_account_type NOT IN ('regular', 'time_deposit') THEN
    RAISE EXCEPTION 'Unsupported member savings account type';
  END IF;

  PERFORM 1 FROM public.members WHERE id = p_member_id FOR UPDATE;
  SELECT id INTO v_account_id
  FROM public.savings_accounts
  WHERE member_id = p_member_id AND account_type = p_account_type AND status = 'active'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  SELECT member_number INTO v_member_number FROM public.members WHERE id = p_member_id;
  IF v_member_number IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  v_account_number := CASE WHEN p_account_type = 'time_deposit' THEN 'TD-' ELSE 'SAV-' END
    || v_member_number || '-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6));

  INSERT INTO public.savings_accounts (account_number, member_id, account_type)
  VALUES (v_account_number, p_member_id, p_account_type)
  RETURNING id INTO v_account_id;
  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public._get_or_create_member_savings_account(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_member_financial_entry(
  p_receipt JSONB,
  p_disbursement JSONB,
  p_entry JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_type TEXT := p_entry->>'entry_type';
  v_member_id UUID := NULLIF(COALESCE(p_receipt->>'member_id', p_disbursement->>'member_id'), '')::UUID;
  v_amount NUMERIC(15, 2) := COALESCE(
    NULLIF(COALESCE(p_receipt->>'amount', p_disbursement->>'amount'), '')::NUMERIC, 0
  );
  v_date DATE := COALESCE(
    NULLIF(COALESCE(p_receipt->>'receipt_date', p_disbursement->>'disbursement_date'), '')::DATE,
    CURRENT_DATE
  );
  v_reference TEXT := trim(COALESCE(p_receipt->>'receipt_number', p_disbursement->>'voucher_number', ''));
  v_description TEXT := trim(COALESCE(p_receipt->>'description', p_disbursement->>'description', ''));
  v_cash_account TEXT := COALESCE(NULLIF(p_entry->>'cash_account', ''), 'Cash on Hand');
  v_account_type TEXT;
  v_account_id UUID;
  v_member_number TEXT;
  v_account_number TEXT;
  v_maturity_date DATE := NULLIF(p_entry->>'maturity_date', '')::DATE;
  v_interest_rate NUMERIC(5, 2) := NULLIF(p_entry->>'interest_rate', '')::NUMERIC;
  v_selected_loan_id UUID := NULLIF(p_entry->>'loan_id', '')::UUID;
  v_receipt_result JSONB;
  v_disbursement_result JSONB;
  v_receipt_id UUID;
  v_disbursement_id UUID;
  v_loan RECORD;
  v_schedule RECORD;
  v_remaining NUMERIC(15, 2);
  v_open_base NUMERIC(15, 2);
  v_open_penalty NUMERIC(15, 2);
  v_take NUMERIC(15, 2);
  v_base_take NUMERIC(15, 2);
  v_interest_installment NUMERIC(15, 2);
  v_interest_piece NUMERIC(15, 2) := 0;
  v_principal_piece NUMERIC(15, 2) := 0;
  v_penalty_piece NUMERIC(15, 2) := 0;
  v_balance_after NUMERIC(15, 2);
  v_installments INTEGER;
  v_total_interest NUMERIC(15, 2);
  v_due_month DATE;
  v_months JSONB;
  v_count INTEGER;
  v_activity_id UUID;
  v_allocations JSONB;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record member financial entries';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('savings_deposit', 'time_deposit', 'savings_withdrawal', 'time_deposit_withdrawal', 'loan_payment', 'capital_contribution') THEN
    RAISE EXCEPTION 'Unsupported member financial entry type';
  END IF;
  IF v_member_id IS NULL OR v_amount <= 0 OR v_reference = '' OR v_description = '' THEN
    RAISE EXCEPTION 'Member, reference, particulars, and a positive amount are required';
  END IF;
  IF v_cash_account NOT IN ('Cash on Hand', 'Cash in Bank') THEN
    RAISE EXCEPTION 'Choose Cash on Hand or Cash in Bank';
  END IF;

  PERFORM 1 FROM public.members
  WHERE id = v_member_id AND membership_status = 'active' AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected member is not active';
  END IF;

  IF v_type IN ('savings_deposit', 'time_deposit', 'savings_withdrawal', 'time_deposit_withdrawal') THEN
    v_account_type := CASE WHEN v_type IN ('time_deposit', 'time_deposit_withdrawal') THEN 'time_deposit' ELSE 'regular' END;
    v_account_id := NULLIF(p_entry->>'savings_account_id', '')::UUID;
    IF v_type = 'time_deposit' THEN
      IF v_account_id IS NOT NULL THEN
        RAISE EXCEPTION 'Each time-deposit placement must create its own account and maturity terms';
      END IF;
      IF v_maturity_date IS NULL OR v_maturity_date <= v_date OR v_interest_rate IS NULL OR v_interest_rate < 0 THEN
        RAISE EXCEPTION 'A time deposit requires a future maturity date and a non-negative interest rate';
      END IF;
      SELECT member_number INTO v_member_number FROM public.members WHERE id = v_member_id;
      v_account_number := 'TD-' || v_member_number || '-'
        || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6));
      INSERT INTO public.savings_accounts (
        account_number, member_id, account_type, opening_date, maturity_date, interest_rate
      ) VALUES (
        v_account_number, v_member_id, 'time_deposit', v_date, v_maturity_date, v_interest_rate
      ) RETURNING id INTO v_account_id;
    ELSIF v_account_id IS NULL AND v_type = 'savings_deposit' THEN
      v_account_id := public._get_or_create_member_savings_account(v_member_id, v_account_type);
    END IF;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Select the member account to withdraw from';
    END IF;
    PERFORM 1 FROM public.savings_accounts
    WHERE id = v_account_id AND member_id = v_member_id
      AND account_type = v_account_type AND status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected savings account is not active or does not belong to this member';
    END IF;
    IF v_type IN ('savings_withdrawal', 'time_deposit_withdrawal')
       AND (SELECT balance FROM public.savings_accounts WHERE id = v_account_id) < v_amount THEN
      RAISE EXCEPTION 'The withdrawal exceeds the available account balance';
    END IF;

    IF v_type IN ('savings_deposit', 'time_deposit') THEN
      IF p_receipt IS NULL OR p_disbursement IS NOT NULL THEN
        RAISE EXCEPTION 'A deposit must be recorded as a cash receipt';
      END IF;
      v_allocations := jsonb_build_array(
        jsonb_build_object('account', v_cash_account, 'amount', v_amount, 'side', 'debit'),
        jsonb_build_object('account', 'Savings / Time Deposit', 'amount', v_amount, 'side', 'credit')
      );
      v_receipt_result := public.save_cash_receipt(
        p_receipt || jsonb_build_object('description', v_description || CASE WHEN v_type = 'time_deposit' THEN ' (time deposit)' ELSE ' (savings deposit)' END),
        v_allocations
      );
      v_receipt_id := (v_receipt_result->>'receipt_id')::UUID;
      DELETE FROM public.member_activity
      WHERE member_id = v_member_id AND reference = v_reference AND activity_type = 'receipt';

      UPDATE public.savings_accounts
      SET balance = balance + v_amount, updated_at = now()
      WHERE id = v_account_id;
      INSERT INTO public.savings_transactions (
        savings_account_id, transaction_type, amount, balance_after, transaction_date,
        description, reference_number, receipt_id, created_by
      )
      SELECT v_account_id, 'deposit', v_amount, balance, v_date, v_description,
             v_reference, v_receipt_id, public.current_staff_id()
      FROM public.savings_accounts WHERE id = v_account_id;
      RETURN jsonb_build_object('receipt_id', v_receipt_id, 'entry_type', v_type);
    END IF;

    IF p_disbursement IS NULL OR p_receipt IS NOT NULL THEN
      RAISE EXCEPTION 'A withdrawal must be recorded as a cash disbursement';
    END IF;
    v_allocations := jsonb_build_array(
      jsonb_build_object('account', 'Savings / Time Deposit', 'amount', v_amount)
    );
    v_disbursement_result := public.save_cash_disbursement(
      p_disbursement || jsonb_build_object('description', v_description),
      v_allocations
    );
    v_disbursement_id := (v_disbursement_result->>'disbursement_id')::UUID;
    UPDATE public.cash_disbursements SET member_id = v_member_id WHERE id = v_disbursement_id;
    UPDATE public.savings_accounts
    SET balance = balance - v_amount, updated_at = now()
    WHERE id = v_account_id;
    INSERT INTO public.savings_transactions (
      savings_account_id, transaction_type, amount, balance_after, transaction_date,
      description, reference_number, disbursement_id, created_by
    )
    SELECT v_account_id, 'withdrawal', v_amount, balance, v_date, v_description,
           v_reference, v_disbursement_id, public.current_staff_id()
    FROM public.savings_accounts WHERE id = v_account_id;
    RETURN jsonb_build_object('disbursement_id', v_disbursement_id, 'entry_type', v_type);
  END IF;

  IF p_receipt IS NULL OR p_disbursement IS NOT NULL THEN
    RAISE EXCEPTION 'This member entry must be recorded as a cash receipt';
  END IF;

  IF v_type = 'capital_contribution' THEN
    v_months := p_entry->'due_months';
    IF v_months IS NULL OR jsonb_typeof(v_months) <> 'array' OR jsonb_array_length(v_months) = 0 THEN
      RAISE EXCEPTION 'Select at least one unpaid monthly capital contribution';
    END IF;
    v_count := jsonb_array_length(v_months);
    IF abs(v_amount - (v_count * 100.00)) > 0.001 THEN
      RAISE EXCEPTION 'Capital contributions must be exactly ₱100 for each selected due month';
    END IF;
    FOR v_due_month IN
      SELECT DISTINCT date_trunc('month', value::DATE)::DATE
      FROM jsonb_array_elements_text(v_months)
    LOOP
      IF v_due_month > date_trunc('month', v_date)::DATE
         OR v_due_month < (
           SELECT date_trunc('month', date_joined)::DATE FROM public.members WHERE id = v_member_id
         ) THEN
        RAISE EXCEPTION 'A selected capital due month is outside the member’s eligible period';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.member_capital_contributions
        WHERE member_id = v_member_id AND due_month = v_due_month
      ) THEN
        RAISE EXCEPTION 'One or more selected capital due months have already been paid';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT date_trunc('month', value::DATE))
        FROM jsonb_array_elements_text(v_months)) <> v_count THEN
      RAISE EXCEPTION 'Do not select a capital due month more than once';
    END IF;

    v_allocations := jsonb_build_array(
      jsonb_build_object('account', v_cash_account, 'amount', v_amount, 'side', 'debit'),
      jsonb_build_object('account', 'Capital Share', 'amount', v_amount, 'side', 'credit')
    );
    v_receipt_result := public.save_cash_receipt(p_receipt || jsonb_build_object('description', v_description), v_allocations);
    v_receipt_id := (v_receipt_result->>'receipt_id')::UUID;
    INSERT INTO public.member_capital_contributions (member_id, due_month, receipt_id, created_by)
    SELECT v_member_id, date_trunc('month', value::DATE)::DATE, v_receipt_id, public.current_staff_id()
    FROM jsonb_array_elements_text(v_months);
    UPDATE public.members SET total_capital = COALESCE(total_capital, 0) + v_amount WHERE id = v_member_id;
    SELECT id INTO v_activity_id FROM public.member_activity
    WHERE member_id = v_member_id AND reference = v_reference AND activity_type = 'receipt'
    ORDER BY created_at DESC LIMIT 1;
    IF v_activity_id IS NOT NULL THEN
      UPDATE public.member_activity
      SET activity_type = 'capital_contribution', title = 'Capital share contribution', amount = v_amount
      WHERE id = v_activity_id;
    END IF;
    RETURN jsonb_build_object('receipt_id', v_receipt_id, 'entry_type', v_type);
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = v_selected_loan_id AND member_id = v_member_id AND status = 'active' AND balance > 0
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active loan belonging to this member with an outstanding balance';
  END IF;
  v_installments := GREATEST(COALESCE(v_loan.installments, v_loan.term_months), 1);
  v_total_interest := COALESCE(v_loan.total_interest, 0);
  v_remaining := v_amount;
  FOR v_schedule IN
    SELECT installment_number, amount_due, amount_paid, penalty_amount
    FROM public.loan_schedule
    WHERE loan_id = v_loan.id AND status <> 'paid'
    ORDER BY installment_number
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_open_base := GREATEST(v_schedule.amount_due - v_schedule.amount_paid, 0);
    v_open_penalty := GREATEST(
      COALESCE(v_schedule.penalty_amount, 0) - GREATEST(v_schedule.amount_paid - v_schedule.amount_due, 0),
      0
    );
    v_take := LEAST(v_remaining, v_open_base + v_open_penalty);
    v_base_take := LEAST(v_take, v_open_base);
    v_interest_installment := CASE
      WHEN v_schedule.installment_number = v_installments
        THEN v_total_interest - round(v_total_interest / v_installments, 2) * (v_installments - 1)
      ELSE round(v_total_interest / v_installments, 2)
    END;
    IF v_schedule.amount_due > 0 AND v_open_base > 0 THEN
      v_interest_piece := v_interest_piece + round(
        v_base_take * LEAST(v_interest_installment, v_schedule.amount_due) / v_schedule.amount_due, 2
      );
    END IF;
    v_penalty_piece := v_penalty_piece + (v_take - v_base_take);
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0.001 THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding amount in the loan schedule';
  END IF;
  v_interest_piece := LEAST(v_interest_piece, v_amount);
  v_penalty_piece := LEAST(v_penalty_piece, v_amount - v_interest_piece);
  v_principal_piece := v_amount - v_interest_piece - v_penalty_piece;
  IF v_principal_piece > v_loan.balance + 0.001 THEN
    RAISE EXCEPTION 'Principal portion exceeds the outstanding balance of the selected loan';
  END IF;
  v_balance_after := GREATEST(v_loan.balance - v_principal_piece, 0);

  v_allocations := jsonb_build_array(
    jsonb_build_object('account', v_cash_account, 'amount', v_amount, 'side', 'debit')
  );
  IF v_principal_piece > 0 THEN
    v_allocations := v_allocations || jsonb_build_array(
      jsonb_build_object('account', 'Loan Receivable', 'amount', v_principal_piece, 'side', 'credit')
    );
  END IF;
  IF v_interest_piece > 0 THEN
    v_allocations := v_allocations || jsonb_build_array(
      jsonb_build_object('account', 'Interest Income', 'amount', v_interest_piece, 'side', 'credit')
    );
  END IF;
  IF v_penalty_piece > 0 THEN
    v_allocations := v_allocations || jsonb_build_array(
      jsonb_build_object('account', 'Other Income', 'amount', v_penalty_piece, 'side', 'credit')
    );
  END IF;
  PERFORM set_config('amcoms.selected_loan_id', v_loan.id::TEXT, true);
  v_receipt_result := public.save_cash_receipt(
    p_receipt || jsonb_build_object('description', v_description || ' (member-loan-payment)'),
    v_allocations
  );
  PERFORM set_config('amcoms.selected_loan_id', '', true);
  v_receipt_id := (v_receipt_result->>'receipt_id')::UUID;
  UPDATE public.loan_payments
  SET principal_paid = v_principal_piece,
      interest_paid = v_interest_piece,
      penalty_paid = v_penalty_piece,
      balance_after = v_balance_after
  WHERE receipt_id = v_receipt_id;
  UPDATE public.loans
  SET balance = v_balance_after,
      status = CASE WHEN v_balance_after = 0 THEN 'completed' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_loan.id;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'loan_id', v_loan.id, 'entry_type', v_type);
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) TO authenticated;

-- Existing deletion RPCs are retained, with member-ledger entries reversed first.
ALTER FUNCTION public.delete_cash_receipt(UUID) RENAME TO delete_cash_receipt_before_member_finance;
REVOKE ALL ON FUNCTION public.delete_cash_receipt_before_member_finance(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_cash_receipt(p_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  t RECORD;
  v_payment RECORD;
  v_capital NUMERIC(15, 2);
  v_had_loan_payment BOOLEAN := false;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can delete transactions';
  END IF;
  SELECT * INTO r FROM public.cash_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  FOR t IN SELECT * FROM public.savings_transactions WHERE receipt_id = r.id FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.savings_transactions later
      WHERE later.savings_account_id = t.savings_account_id AND later.id <> t.id
        AND later.created_at > t.created_at
    ) THEN
      RAISE EXCEPTION 'Cannot delete this receipt because later account transactions depend on its balance';
    END IF;
    UPDATE public.savings_accounts
    SET balance = balance - CASE WHEN t.transaction_type = 'withdrawal' THEN -t.amount ELSE t.amount END,
        updated_at = now()
    WHERE id = t.savings_account_id;
    DELETE FROM public.savings_transactions WHERE id = t.id;
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_capital
  FROM public.member_capital_contributions WHERE receipt_id = r.id;
  IF v_capital > 0 AND r.member_id IS NOT NULL THEN
    UPDATE public.members
    SET total_capital = GREATEST(COALESCE(total_capital, 0) - v_capital, 0)
    WHERE id = r.member_id;
  END IF;
  DELETE FROM public.member_capital_contributions WHERE receipt_id = r.id;
  DELETE FROM public.member_activity
  WHERE member_id = r.member_id AND reference = r.receipt_number
    AND activity_type = 'capital_contribution';
  SELECT loan_id, interest_paid, penalty_paid INTO v_payment
  FROM public.loan_payments
  WHERE receipt_id = r.id
  FOR UPDATE;
  v_had_loan_payment := FOUND;
  PERFORM public.delete_cash_receipt_before_member_finance(p_receipt_id);
  IF v_had_loan_payment THEN
    UPDATE public.loans
    SET balance = GREATEST(balance - COALESCE(v_payment.interest_paid, 0) - COALESCE(v_payment.penalty_paid, 0), 0),
        status = CASE
          WHEN GREATEST(balance - COALESCE(v_payment.interest_paid, 0) - COALESCE(v_payment.penalty_paid, 0), 0) = 0
            THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE id = v_payment.loan_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cash_receipt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cash_receipt(UUID) TO authenticated;

ALTER FUNCTION public.delete_cash_disbursement(UUID) RENAME TO delete_cash_disbursement_before_member_finance;
REVOKE ALL ON FUNCTION public.delete_cash_disbursement_before_member_finance(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_cash_disbursement(p_disbursement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d RECORD;
  t RECORD;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can delete transactions';
  END IF;
  SELECT * INTO d FROM public.cash_disbursements WHERE id = p_disbursement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  FOR t IN SELECT * FROM public.savings_transactions WHERE disbursement_id = d.id FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.savings_transactions later
      WHERE later.savings_account_id = t.savings_account_id AND later.id <> t.id
        AND later.created_at > t.created_at
    ) THEN
      RAISE EXCEPTION 'Cannot delete this voucher because later account transactions depend on its balance';
    END IF;
    UPDATE public.savings_accounts
    SET balance = balance + CASE WHEN t.transaction_type = 'withdrawal' THEN t.amount ELSE -t.amount END,
        updated_at = now()
    WHERE id = t.savings_account_id;
    DELETE FROM public.savings_transactions WHERE id = t.id;
  END LOOP;
  PERFORM public.delete_cash_disbursement_before_member_finance(p_disbursement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cash_disbursement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cash_disbursement(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.member_dividend_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id),
  distribution_year INTEGER NOT NULL,
  reference_number TEXT NOT NULL UNIQUE,
  distribution_date DATE NOT NULL,
  dividend_amount NUMERIC(15, 2) NOT NULL CHECK (dividend_amount >= 0),
  patronage_amount NUMERIC(15, 2) NOT NULL CHECK (patronage_amount >= 0),
  mortuary_deduction NUMERIC(15, 2) NOT NULL CHECK (mortuary_deduction >= 0),
  retention_amount NUMERIC(15, 2) NOT NULL CHECK (retention_amount >= 0),
  savings_amount NUMERIC(15, 2) NOT NULL CHECK (savings_amount >= 0),
  loan_payment_amount NUMERIC(15, 2) NOT NULL CHECK (loan_payment_amount >= 0),
  loan_id UUID REFERENCES public.loans(id),
  loan_principal_paid NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (loan_principal_paid >= 0),
  loan_interest_paid NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (loan_interest_paid >= 0),
  loan_penalty_paid NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (loan_penalty_paid >= 0),
  savings_account_id UUID REFERENCES public.savings_accounts(id),
  journal_entry_id UUID NOT NULL UNIQUE REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    round(dividend_amount + patronage_amount - mortuary_deduction, 2)
    = round(retention_amount + savings_amount + loan_payment_amount, 2)
  ),
  CHECK ((loan_payment_amount = 0 AND loan_id IS NULL) OR (loan_payment_amount > 0 AND loan_id IS NOT NULL))
);

ALTER TABLE public.member_dividend_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own dividend distributions" ON public.member_dividend_distributions;
CREATE POLICY "Members can view own dividend distributions"
  ON public.member_dividend_distributions FOR SELECT TO authenticated
  USING (member_id = public.get_member_id());

DROP POLICY IF EXISTS "Financial staff can view dividend distributions" ON public.member_dividend_distributions;
CREATE POLICY "Financial staff can view dividend distributions"
  ON public.member_dividend_distributions FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

REVOKE INSERT, UPDATE, DELETE ON public.member_dividend_distributions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_dividend_distributions TO authenticated;

INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, description)
SELECT 'EQUITY-DIV-PATRONAGE', 'Member Dividend and Patronage Distributions', 'equity', 'Member distributions',
       'Approved member dividends and patronage distributions distributed from cooperative equity'
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts WHERE account_name = 'Member Dividend and Patronage Distributions'
)
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, description)
SELECT 'LIAB-MORTUARY-PAYABLE', 'Mortuary Aid Payable', 'liability', 'Member benefits',
       'Mortuary deductions retained for cooperative mortuary aid'
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts WHERE account_name = 'Mortuary Aid Payable'
)
ON CONFLICT (account_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_member_dividend(p_distribution JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_member_id UUID := NULLIF(p_distribution->>'member_id', '')::UUID;
  v_date DATE := NULLIF(p_distribution->>'distribution_date', '')::DATE;
  v_reference TEXT := trim(COALESCE(p_distribution->>'reference_number', ''));
  v_dividend NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'dividend_amount', '')::NUMERIC, 0), 2);
  v_patronage NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'patronage_amount', '')::NUMERIC, 0), 2);
  v_mortuary NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'mortuary_deduction', '')::NUMERIC, 0), 2);
  v_retention NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'retention_amount', '')::NUMERIC, 0), 2);
  v_savings NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'savings_amount', '')::NUMERIC, 0), 2);
  v_loan_payment NUMERIC(15, 2) := round(COALESCE(NULLIF(p_distribution->>'loan_payment_amount', '')::NUMERIC, 0), 2);
  v_gross NUMERIC(15, 2);
  v_net NUMERIC(15, 2);
  v_loan RECORD;
  v_schedule RECORD;
  v_loan_id UUID;
  v_savings_account_id UUID;
  v_journal_id UUID;
  v_next_payment INTEGER;
  v_installments INTEGER;
  v_interest_installment NUMERIC(15, 2);
  v_remaining NUMERIC(15, 2);
  v_open_base NUMERIC(15, 2);
  v_open_penalty NUMERIC(15, 2);
  v_take NUMERIC(15, 2);
  v_base_take NUMERIC(15, 2);
  v_interest NUMERIC(15, 2) := 0;
  v_penalty NUMERIC(15, 2) := 0;
  v_principal NUMERIC(15, 2);
  v_balance_after NUMERIC(15, 2);
  v_distribution_account UUID;
  v_mortuary_account UUID;
  v_capital_account UUID;
  v_savings_account UUID;
  v_receivable_account UUID;
  v_interest_account UUID;
  v_penalty_account UUID;
  v_created_by UUID := public.current_staff_id();
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record approved dividend distributions';
  END IF;
  IF v_member_id IS NULL OR v_date IS NULL OR v_reference = '' THEN
    RAISE EXCEPTION 'Member, distribution date, and reference number are required';
  END IF;
  IF v_dividend + v_patronage <= 0 THEN
    RAISE EXCEPTION 'Dividend and patronage total must be greater than zero';
  END IF;
  IF LEAST(v_dividend, v_patronage, v_mortuary, v_retention, v_savings, v_loan_payment) < 0 THEN
    RAISE EXCEPTION 'Dividend distribution amounts cannot be negative';
  END IF;
  v_gross := v_dividend + v_patronage;
  v_net := v_gross - v_mortuary;
  IF v_net < 0 OR round(v_net, 2) <> round(v_retention + v_savings + v_loan_payment, 2) THEN
    RAISE EXCEPTION 'Dividend and patronage less mortuary must equal retention plus savings plus loan payment';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('member_dividend:' || v_reference));
  PERFORM 1 FROM public.members
  WHERE id = v_member_id AND membership_status = 'active' AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The selected member is not active'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_dividend_distributions WHERE reference_number = v_reference) THEN
    RAISE EXCEPTION 'This dividend reference number has already been used';
  END IF;

  IF v_savings > 0 THEN
    v_savings_account_id := NULLIF(p_distribution->>'savings_account_id', '')::UUID;
    IF v_savings_account_id IS NULL THEN
      v_savings_account_id := public._get_or_create_member_savings_account(v_member_id, 'regular');
    ELSE
      PERFORM 1 FROM public.savings_accounts
      WHERE id = v_savings_account_id AND member_id = v_member_id
        AND account_type = 'regular' AND status = 'active'
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'The selected savings account is not active or does not belong to this member'; END IF;
    END IF;
    SELECT id INTO v_savings_account FROM public.chart_of_accounts
    WHERE account_name = 'Savings / Time Deposit' AND is_active;
  END IF;
  IF v_loan_payment > 0 THEN
    SELECT * INTO v_loan
    FROM public.loans
    WHERE member_id = v_member_id AND status = 'active' AND balance > 0
    ORDER BY release_date NULLS LAST, created_at
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This member has no active loan for the dividend loan-payment allocation'; END IF;
    v_loan_id := v_loan.id;
    IF NULLIF(p_distribution->>'loan_id', '')::UUID IS DISTINCT FROM v_loan.id THEN
      RAISE EXCEPTION 'Select the oldest active loan so the dividend payment follows its unpaid schedule';
    END IF;
    v_installments := GREATEST(COALESCE(v_loan.installments, v_loan.term_months), 1);
    v_remaining := v_loan_payment;
    FOR v_schedule IN
      SELECT installment_number, amount_due, amount_paid, penalty_amount
      FROM public.loan_schedule
      WHERE loan_id = v_loan.id AND status <> 'paid'
      ORDER BY installment_number
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_open_base := GREATEST(v_schedule.amount_due - v_schedule.amount_paid, 0);
      v_open_penalty := GREATEST(
        COALESCE(v_schedule.penalty_amount, 0) - GREATEST(v_schedule.amount_paid - v_schedule.amount_due, 0),
        0
      );
      v_take := LEAST(v_remaining, v_open_base + v_open_penalty);
      v_base_take := LEAST(v_take, v_open_base);
      v_interest_installment := CASE
        WHEN v_schedule.installment_number = v_installments
          THEN COALESCE(v_loan.total_interest, 0) - round(COALESCE(v_loan.total_interest, 0) / v_installments, 2) * (v_installments - 1)
        ELSE round(COALESCE(v_loan.total_interest, 0) / v_installments, 2)
      END;
      IF v_schedule.amount_due > 0 AND v_open_base > 0 THEN
        v_interest := v_interest + round(
          v_base_take * LEAST(v_interest_installment, v_schedule.amount_due) / v_schedule.amount_due, 2
        );
      END IF;
      v_penalty := v_penalty + (v_take - v_base_take);
      v_remaining := v_remaining - v_take;
    END LOOP;
    IF v_remaining > 0.001 THEN
      RAISE EXCEPTION 'Dividend loan allocation exceeds the outstanding scheduled amount';
    END IF;
    v_interest := LEAST(v_interest, v_loan_payment);
    v_penalty := LEAST(v_penalty, v_loan_payment - v_interest);
    v_principal := v_loan_payment - v_interest - v_penalty;
    IF v_principal > v_loan.balance + 0.001 THEN
      RAISE EXCEPTION 'Dividend principal allocation exceeds the outstanding loan balance';
    END IF;
    v_balance_after := GREATEST(v_loan.balance - v_principal, 0);
  ELSE
    v_principal := 0;
    v_balance_after := NULL;
  END IF;

  SELECT id INTO v_distribution_account FROM public.chart_of_accounts
  WHERE account_name = 'Member Dividend and Patronage Distributions' AND is_active;
  SELECT id INTO v_mortuary_account FROM public.chart_of_accounts
  WHERE account_name = 'Mortuary Aid Payable' AND is_active;
  SELECT id INTO v_capital_account FROM public.chart_of_accounts
  WHERE account_name = 'Capital Share' AND is_active;
  SELECT id INTO v_receivable_account FROM public.chart_of_accounts
  WHERE account_name = 'Loan Receivable' AND is_active;
  SELECT id INTO v_interest_account FROM public.chart_of_accounts
  WHERE account_name = 'Interest Income' AND is_active;
  SELECT id INTO v_penalty_account FROM public.chart_of_accounts
  WHERE account_name = 'Other Income' AND is_active;
  IF v_distribution_account IS NULL OR v_mortuary_account IS NULL OR v_capital_account IS NULL
     OR (v_savings > 0 AND v_savings_account IS NULL)
     OR (v_principal > 0 AND v_receivable_account IS NULL)
     OR (v_interest > 0 AND v_interest_account IS NULL)
     OR (v_penalty > 0 AND v_penalty_account IS NULL) THEN
    RAISE EXCEPTION 'A required chart-of-accounts mapping is missing';
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    'DIV-' || v_reference, v_date, 'Approved dividend and patronage distribution',
    v_reference, 'general', 'posted', v_created_by, v_created_by, now()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  SELECT v_journal_id, a.account_id, a.debit, a.credit, 'Dividend distribution ' || v_reference
  FROM (VALUES
    (v_distribution_account, v_gross, 0::NUMERIC),
    (v_mortuary_account, 0::NUMERIC, v_mortuary),
    (v_capital_account, 0::NUMERIC, v_retention),
    (v_savings_account, 0::NUMERIC, v_savings),
    (v_receivable_account, 0::NUMERIC, v_principal),
    (v_interest_account, 0::NUMERIC, v_interest),
    (v_penalty_account, 0::NUMERIC, v_penalty)
  ) AS a(account_id, debit, credit)
  WHERE a.account_id IS NOT NULL AND (a.debit > 0 OR a.credit > 0);

  INSERT INTO public.member_dividend_distributions (
    member_id, distribution_year, reference_number, distribution_date,
    dividend_amount, patronage_amount, mortuary_deduction, retention_amount,
    savings_amount, loan_payment_amount, loan_id, loan_principal_paid,
    loan_interest_paid, loan_penalty_paid, savings_account_id,
    journal_entry_id, created_by
  ) VALUES (
    v_member_id, EXTRACT(YEAR FROM v_date)::INTEGER, v_reference, v_date,
    v_dividend, v_patronage, v_mortuary, v_retention, v_savings, v_loan_payment,
    v_loan_id, v_principal, v_interest, v_penalty, v_savings_account_id,
    v_journal_id, v_created_by
  );

  IF v_retention > 0 THEN
    UPDATE public.members SET total_capital = COALESCE(total_capital, 0) + v_retention WHERE id = v_member_id;
  END IF;
  IF v_savings > 0 THEN
    UPDATE public.savings_accounts
    SET balance = balance + v_savings, updated_at = now()
    WHERE id = v_savings_account_id;
    INSERT INTO public.savings_transactions (
      savings_account_id, transaction_type, amount, balance_after, transaction_date,
      description, reference_number, created_by
    )
    SELECT v_savings_account_id, 'deposit', v_savings, balance, v_date,
           'Dividend distribution', v_reference, v_created_by
    FROM public.savings_accounts WHERE id = v_savings_account_id;
  END IF;
  IF v_loan_payment > 0 THEN
    SELECT COALESCE(MAX(payment_number), 0) + 1 INTO v_next_payment
    FROM public.loan_payments WHERE loan_id = v_loan_id;
    INSERT INTO public.loan_payments (
      loan_id, payment_number, payment_date, amount_paid, principal_paid,
      interest_paid, penalty_paid, balance_after, payment_method, reference_number, created_by
    ) VALUES (
      v_loan_id, v_next_payment, v_date, v_loan_payment, v_principal,
      v_interest, v_penalty, v_balance_after, 'other', v_reference, v_created_by
    );
    UPDATE public.loans
    SET balance = v_balance_after,
        status = CASE WHEN v_balance_after = 0 THEN 'completed' ELSE 'active' END,
        updated_at = now()
    WHERE id = v_loan_id;
    UPDATE public.loan_payments
    SET balance_after = v_balance_after
    WHERE loan_id = v_loan_id AND payment_number = v_next_payment;
  END IF;
  INSERT INTO public.member_activity (member_id, activity_type, title, amount, reference, created_by)
  VALUES (
    v_member_id, 'dividend', 'Dividend and patronage distribution',
    v_net, v_reference, v_created_by
  );

  RETURN jsonb_build_object('distribution_id', (
    SELECT id FROM public.member_dividend_distributions WHERE journal_entry_id = v_journal_id
  ), 'journal_entry_id', v_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_dividend(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_dividend(JSONB) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
         AND tablename = 'member_dividend_distributions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_dividend_distributions;
  END IF;
END $$;

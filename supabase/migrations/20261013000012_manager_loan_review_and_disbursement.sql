-- Separate loan approval from the cash release: Managers decide applications;
-- Bookkeepers post the disbursement and activate the repayment schedule.

ALTER TABLE public.cash_disbursements
  ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES public.loans(id);

CREATE UNIQUE INDEX IF NOT EXISTS cash_disbursements_loan_id_idx
  ON public.cash_disbursements (loan_id)
  WHERE loan_id IS NOT NULL;

DROP POLICY IF EXISTS "Bookkeepers can review requests" ON public.requests;
DROP POLICY IF EXISTS "Bookkeepers review non-loan requests" ON public.requests;
CREATE POLICY "Bookkeepers review non-loan requests"
  ON public.requests FOR UPDATE
  USING (public.has_role('bookkeeper') AND request_type <> 'loan_application')
  WITH CHECK (public.has_role('bookkeeper') AND request_type <> 'loan_application');

CREATE OR REPLACE FUNCTION public.review_loan_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.requests%ROWTYPE;
  v_staff_id UUID := public.current_staff_id();
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('manager') THEN
    RAISE EXCEPTION 'Only an active Manager can review loan applications';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected')
     OR COALESCE(trim(p_notes), '') = '' THEN
    RAISE EXCEPTION 'Choose approve or reject and provide decision notes';
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id AND request_type = 'loan_application'
  FOR UPDATE;
  IF NOT FOUND OR v_request.status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'This loan application was not found or has already been reviewed';
  END IF;

  UPDATE public.requests
  SET status = p_decision,
      reviewed_by = v_staff_id,
      reviewed_at = now(),
      review_notes = trim(p_notes),
      approved_by = CASE WHEN p_decision = 'approved' THEN v_staff_id ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
      approval_notes = CASE WHEN p_decision = 'approved' THEN trim(p_notes) ELSE NULL END,
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_loan_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_loan_request(UUID, TEXT, TEXT) TO authenticated;

-- Approval creates a priced loan record in the approved state, but no debt,
-- cash disbursement, or repayment schedule until the Bookkeeper releases funds.
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
  v_number TEXT;
  v_seq INTEGER;
  v_prefix TEXT := 'L-' || to_char(CURRENT_DATE, 'YYYY') || '-';
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
    round((q->>'total_payable')::NUMERIC / v_term, 2),
    (q->>'total_interest')::NUMERIC, (q->>'total_payable')::NUMERIC, 0,
    NEW.created_at::DATE, CURRENT_DATE, NULL, NULL, 'approved', NEW.reviewed_by,
    NULLIF(NEW.request_data->>'purpose', ''), v_freq, (q->>'installments')::INTEGER,
    (q->>'installment_amount')::NUMERIC, (q->>'penalty_rate')::NUMERIC, NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_loan_disbursement(
  p_loan_id UUID,
  p_voucher_number TEXT,
  p_disbursement_date DATE,
  p_payment_source TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_member_name TEXT;
  v_voucher TEXT := trim(COALESCE(p_voucher_number, ''));
  v_result JSONB;
  v_disbursement_id UUID;
  v_installment INTEGER;
  v_installments INTEGER;
  v_installment_amount NUMERIC(15, 2);
  v_final_amount NUMERIC(15, 2);
  v_due_date DATE;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only an active Bookkeeper can record a loan cash release';
  END IF;
  IF p_disbursement_date IS NULL OR v_voucher = '' OR p_payment_source IS NULL
     OR p_payment_source NOT IN ('cash-on-hand', 'cash-in-bank') THEN
    RAISE EXCEPTION 'Enter a release date, voucher number, and valid cash account';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id AND status = 'approved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This loan is not approved or has already been released';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.requests
    WHERE id = v_loan.request_id AND request_type = 'loan_application' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'The loan application has not been approved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_disbursements WHERE loan_id = v_loan.id) THEN
    RAISE EXCEPTION 'This loan already has a recorded cash release';
  END IF;

  SELECT trim(concat_ws(' ', first_name, middle_name, last_name))
  INTO v_member_name
  FROM public.members
  WHERE id = v_loan.member_id;
  IF COALESCE(v_member_name, '') = '' THEN
    RAISE EXCEPTION 'The member linked to this loan could not be found';
  END IF;

  v_result := public.save_cash_disbursement(
    jsonb_build_object(
      'disbursement_date', p_disbursement_date,
      'voucher_number', v_voucher,
      'payee', v_member_name,
      'member_id', v_loan.member_id,
      'amount', v_loan.principal_amount,
      'payment_source', p_payment_source,
      'description', 'Loan release ' || v_loan.loan_number,
      'status', 'recorded'
    ),
    jsonb_build_array(
      jsonb_build_object('account', 'Loan Payable', 'amount', v_loan.principal_amount)
    )
  );
  v_disbursement_id := (v_result->>'disbursement_id')::UUID;

  UPDATE public.cash_disbursements
  SET member_id = v_loan.member_id,
      loan_id = v_loan.id
  WHERE id = v_disbursement_id;

  v_installments := COALESCE(v_loan.installments, v_loan.term_months);
  v_installment_amount := COALESCE(v_loan.installment_amount, round(v_loan.total_amount / v_installments, 2));
  IF v_installments < 1 OR v_installment_amount <= 0 THEN
    RAISE EXCEPTION 'The approved loan has invalid repayment terms';
  END IF;
  v_final_amount := v_loan.total_amount - v_installment_amount * (v_installments - 1);

  UPDATE public.loans
  SET status = 'active',
      balance = principal_amount,
      release_date = p_disbursement_date,
      maturity_date = CASE
        WHEN v_loan.payment_frequency = 'weekly' THEN p_disbursement_date + (v_installments * 7)
        ELSE (p_disbursement_date + make_interval(months => v_installments))::DATE
      END,
      updated_at = now()
  WHERE id = v_loan.id;

  FOR v_installment IN 1..v_installments LOOP
    v_due_date := CASE
      WHEN v_loan.payment_frequency = 'weekly' THEN p_disbursement_date + (v_installment * 7)
      ELSE (p_disbursement_date + make_interval(months => v_installment))::DATE
    END;
    INSERT INTO public.loan_schedule (loan_id, installment_number, due_date, amount_due)
    VALUES (
      v_loan.id,
      v_installment,
      v_due_date,
      CASE WHEN v_installment = v_installments THEN v_final_amount ELSE v_installment_amount END
    );
  END LOOP;

  RETURN v_result || jsonb_build_object(
    'loan_id', v_loan.id,
    'loan_number', v_loan.loan_number,
    'status', 'active',
    'release_date', p_disbursement_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_loan_disbursement(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_loan_disbursement(UUID, TEXT, DATE, TEXT) TO authenticated;

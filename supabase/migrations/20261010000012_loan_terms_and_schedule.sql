-- Loan terms, repayment schedule, automatic loan creation on approval,
-- late penalties and the data needed for due-date SMS reminders.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Terms. Rates are flat per-annum estimates and can be edited in this table.
-- penalty_rate is charged once on each installment that is paid late.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_term_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  payment_frequency TEXT NOT NULL CHECK (payment_frequency IN ('monthly', 'weekly')),
  annual_rate NUMERIC(5, 2) NOT NULL CHECK (annual_rate >= 0),
  penalty_rate NUMERIC(5, 2) NOT NULL CHECK (penalty_rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (term_months, payment_frequency)
);

INSERT INTO public.loan_term_options (term_months, payment_frequency, annual_rate, penalty_rate) VALUES
  (12, 'monthly', 12.00, 2.00),
  (24, 'monthly', 14.00, 2.00),
  (36, 'monthly', 16.00, 2.00),
  (12, 'weekly', 11.00, 0.50),
  (24, 'weekly', 13.00, 0.50),
  (36, 'weekly', 15.00, 0.50)
ON CONFLICT (term_months, payment_frequency) DO NOTHING;

ALTER TABLE public.loan_term_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can view loan terms" ON public.loan_term_options;
CREATE POLICY "Signed-in users can view loan terms"
  ON public.loan_term_options FOR SELECT TO authenticated USING (is_active);

-- ---------------------------------------------------------------------------
-- Loans and schedule
-- ---------------------------------------------------------------------------
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS installments INTEGER,
  ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS penalty_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id UUID UNIQUE REFERENCES public.requests(id);

CREATE TABLE IF NOT EXISTS public.loan_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount_due NUMERIC(15, 2) NOT NULL,
  amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0,
  penalty_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  penalty_applied BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'overdue', 'paid')),
  paid_at TIMESTAMPTZ,
  UNIQUE (loan_id, installment_number)
);
CREATE INDEX IF NOT EXISTS loan_schedule_due_idx ON public.loan_schedule(due_date) WHERE status <> 'paid';

ALTER TABLE public.loan_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view own loan schedule" ON public.loan_schedule;
CREATE POLICY "Members can view own loan schedule"
  ON public.loan_schedule FOR SELECT
  USING (loan_id IN (SELECT id FROM public.loans WHERE member_id = public.get_member_id()));
DROP POLICY IF EXISTS "Staff can view loan schedule" ON public.loan_schedule;
CREATE POLICY "Staff can view loan schedule"
  ON public.loan_schedule FOR SELECT
  USING (public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']));

DROP POLICY IF EXISTS "Bookkeeper can view all loans" ON public.loans;
CREATE POLICY "Bookkeeper can view all loans"
  ON public.loans FOR SELECT USING (public.has_role('bookkeeper'));

-- ---------------------------------------------------------------------------
-- Quote (single source of truth for the loan math)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loan_quote(p_amount NUMERIC, p_term_months INTEGER, p_frequency TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  opt RECORD;
  n INTEGER;
  v_interest NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT * INTO opt FROM public.loan_term_options
  WHERE term_months = p_term_months AND payment_frequency = p_frequency AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That loan term is not available.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a loan amount greater than zero.';
  END IF;

  n := CASE WHEN p_frequency = 'weekly' THEN round(p_term_months * 52.0 / 12)::INTEGER ELSE p_term_months END;
  v_interest := round(p_amount * opt.annual_rate / 100 * p_term_months / 12.0, 2);
  v_total := p_amount + v_interest;

  RETURN jsonb_build_object(
    'term_months', p_term_months,
    'payment_frequency', p_frequency,
    'annual_rate', opt.annual_rate,
    'penalty_rate', opt.penalty_rate,
    'installments', n,
    'installment_amount', round(v_total / n, 2),
    'total_interest', v_interest,
    'total_payable', v_total
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Member submits a loan request; terms are priced on the server.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_loan_request(
  p_amount NUMERIC,
  p_loan_type TEXT,
  p_purpose TEXT,
  p_term_months INTEGER,
  p_frequency TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member UUID := public.get_member_id();
  v_staff UUID;
  v_quote JSONB;
  v_id UUID;
BEGIN
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Your member profile could not be verified.';
  END IF;
  IF COALESCE(trim(p_purpose), '') = '' THEN
    RAISE EXCEPTION 'Please describe the purpose of the loan.';
  END IF;
  SELECT id INTO v_staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  v_quote := public.loan_quote(p_amount, p_term_months, p_frequency);

  INSERT INTO public.requests (request_number, request_type, member_id, requester_id, request_data, amount)
  VALUES (
    'LOAN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::TEXT, 1, 6)),
    'loan_application', v_member, v_staff,
    jsonb_build_object(
      'type', 'Loan Application',
      'loan_type', left(COALESCE(p_loan_type, ''), 60),
      'purpose', left(trim(p_purpose), 500)
    ) || v_quote,
    p_amount
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_loan_request(NUMERIC, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_loan_request(NUMERIC, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Approval creates the loan, adds it to the member's balance, builds the schedule.
-- ---------------------------------------------------------------------------
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
    round(v_total / v_term, 2), (q->>'total_interest')::NUMERIC, v_total, v_total,
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

DROP TRIGGER IF EXISTS create_loan_on_request_approval ON public.requests;
CREATE TRIGGER create_loan_on_request_approval
  AFTER UPDATE OF status ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.create_loan_from_request();

-- ---------------------------------------------------------------------------
-- Payments reduce the balance and settle the oldest installments first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_loan_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  remaining NUMERIC := NEW.amount_paid;
  row_ RECORD;
  need NUMERIC;
  take NUMERIC;
BEGIN
  FOR row_ IN
    SELECT * FROM public.loan_schedule
    WHERE loan_id = NEW.loan_id AND status <> 'paid'
    ORDER BY installment_number
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    need := row_.amount_due + row_.penalty_amount - row_.amount_paid;
    take := LEAST(remaining, need);
    UPDATE public.loan_schedule
    SET amount_paid = amount_paid + take,
        status = CASE WHEN amount_paid + take >= amount_due + penalty_amount THEN 'paid' ELSE status END,
        paid_at = CASE WHEN amount_paid + take >= amount_due + penalty_amount THEN now() ELSE paid_at END
    WHERE id = row_.id;
    remaining := remaining - take;
  END LOOP;

  UPDATE public.loans
  SET balance = GREATEST(balance - NEW.amount_paid, 0),
      status = CASE WHEN balance - NEW.amount_paid <= 0 THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = NEW.loan_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_payment_to_loan ON public.loan_payments;
CREATE TRIGGER apply_payment_to_loan
  AFTER INSERT ON public.loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_loan_payment();

-- ---------------------------------------------------------------------------
-- Late penalty: charged once per late installment and added to the balance.
-- Run daily by the loan-due-reminders function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_loan_penalties()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_ RECORD;
  v_penalty NUMERIC;
  v_count INTEGER := 0;
BEGIN
  FOR row_ IN
    SELECT s.id, s.loan_id, s.amount_due, s.amount_paid, l.penalty_rate
    FROM public.loan_schedule s
    JOIN public.loans l ON l.id = s.loan_id
    WHERE s.status <> 'paid' AND s.due_date < (now() AT TIME ZONE 'Asia/Manila')::DATE
      AND l.status = 'active'
    FOR UPDATE OF s
  LOOP
    IF NOT (SELECT penalty_applied FROM public.loan_schedule WHERE id = row_.id) THEN
      v_penalty := round((row_.amount_due - LEAST(row_.amount_paid, row_.amount_due)) * row_.penalty_rate / 100, 2);
      UPDATE public.loan_schedule
      SET penalty_amount = v_penalty, penalty_applied = true, status = 'overdue'
      WHERE id = row_.id;
      UPDATE public.loans
      SET balance = balance + v_penalty, penalty_total = penalty_total + v_penalty, updated_at = now()
      WHERE id = row_.loan_id;
      v_count := v_count + 1;
    ELSE
      UPDATE public.loan_schedule SET status = 'overdue' WHERE id = row_.id AND status = 'pending';
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_loan_penalties() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loan_penalties() TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_schedule;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

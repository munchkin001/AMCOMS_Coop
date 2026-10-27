-- General Ledger: immutability of posted entries, balance enforcement,
-- authorized manual/adjusting entries, reversals, and ledger/trial balance queries.
-- The ledger is always derived from posted journal_entries / journal_entry_lines.

-- 1. Reversal / audit columns -------------------------------------------------
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id UUID REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_reverses
  ON public.journal_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

-- A source document can only ever point at one journal entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_receipts_journal_entry
  ON public.cash_receipts (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_disbursements_journal_entry
  ON public.cash_disbursements (journal_entry_id) WHERE journal_entry_id IS NOT NULL;

ALTER TABLE public.journal_entry_lines
  DROP CONSTRAINT IF EXISTS journal_entry_lines_amounts_check;
ALTER TABLE public.journal_entry_lines
  ADD CONSTRAINT journal_entry_lines_amounts_check
  CHECK (debit_amount >= 0 AND credit_amount >= 0 AND NOT (debit_amount > 0 AND credit_amount > 0));

CREATE SEQUENCE IF NOT EXISTS public.journal_entry_seq;

-- 2. Immutability guards -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_journal_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft'
       AND NOT (
         pg_has_role(
           session_user,
           (SELECT relowner FROM pg_class WHERE oid = 'public.journal_entries'::regclass),
           'MEMBER'
         )
         OR COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false)
       ) THEN
      RAISE EXCEPTION 'Posted journal entries cannot be deleted. Post a reversing entry instead.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'posted' THEN
    IF NEW.status <> 'posted'
       OR NEW.entry_number IS DISTINCT FROM OLD.entry_number
       OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.posted_by IS DISTINCT FROM OLD.posted_by
       OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
       OR NEW.reverses_entry_id IS DISTINCT FROM OLD.reverses_entry_id THEN
      RAISE EXCEPTION 'Posted journal entries cannot be modified. Post a reversing or adjusting entry instead.';
    END IF;
    IF OLD.reversed_by_entry_id IS NOT NULL
       AND (NEW.reversed_by_entry_id IS DISTINCT FROM OLD.reversed_by_entry_id
         OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
         OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
         OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason) THEN
      RAISE EXCEPTION 'This entry has already been reversed.';
    END IF;
  ELSIF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'Void journal entries cannot be reopened.';
  ELSIF NEW.status = 'posted' THEN
    NEW.posted_by := COALESCE(NEW.posted_by, public.current_staff_id());
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_journal_entries ON public.journal_entries;
CREATE TRIGGER guard_journal_entries
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entries();

CREATE OR REPLACE FUNCTION public.guard_journal_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry RECORD;
BEGIN
  IF TG_OP = 'DELETE'
     AND (
       pg_has_role(
         session_user,
         (SELECT relowner FROM pg_class WHERE oid = 'public.journal_entry_lines'::regclass),
         'MEMBER'
       )
       OR COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false)
     ) THEN
    RETURN OLD;
  END IF;

  SELECT status, created_at INTO v_entry
  FROM public.journal_entries
  WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.journal_entry_id ELSE OLD.journal_entry_id END;

  IF FOUND AND v_entry.status <> 'draft' THEN
    -- Lines may only be written in the same transaction that created the entry.
    IF TG_OP <> 'INSERT' OR v_entry.created_at <> now() THEN
      RAISE EXCEPTION 'Lines of a posted journal entry cannot be changed. Post a reversing or adjusting entry instead.';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_journal_lines ON public.journal_entry_lines;
CREATE TRIGGER guard_journal_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_journal_lines();

-- 3. Double-entry enforcement (checked at commit) ------------------------------
CREATE OR REPLACE FUNCTION public.check_journal_entry_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry_id UUID := CASE WHEN TG_TABLE_NAME = 'journal_entries' THEN NEW.id ELSE COALESCE(NEW.journal_entry_id, OLD.journal_entry_id) END;
  v_entry RECORD;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_count INTEGER;
BEGIN
  SELECT id, entry_number, status INTO v_entry FROM public.journal_entries WHERE id = v_entry_id;
  IF NOT FOUND OR v_entry.status <> 'posted' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0), COUNT(*)
  INTO v_debit, v_credit, v_count
  FROM public.journal_entry_lines WHERE journal_entry_id = v_entry_id;

  IF v_count < 2 OR v_debit <= 0 OR v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal entry % is not balanced: debits % vs credits %', v_entry.entry_number, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS check_balanced_entries ON public.journal_entries;
CREATE CONSTRAINT TRIGGER check_balanced_entries
  AFTER INSERT OR UPDATE ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_journal_entry_balanced();

DROP TRIGGER IF EXISTS check_balanced_lines ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER check_balanced_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_journal_entry_balanced();

-- 4. Reversal (internal) and authorized RPCs ------------------------------------
CREATE OR REPLACE FUNCTION public._reverse_journal_entry(p_entry_id UUID, p_reason TEXT, p_actor UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry RECORD;
  v_reversal_id UUID;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reverse an entry';
  END IF;

  SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;
  IF v_entry.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted entries can be reversed';
  END IF;
  IF v_entry.entry_type = 'reversing' OR v_entry.reverses_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reversing entry cannot itself be reversed';
  END IF;
  IF v_entry.reversed_by_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Entry % has already been reversed', v_entry.entry_number;
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at, reverses_entry_id
  ) VALUES (
    'RV-' || v_entry.entry_number,
    (now() AT TIME ZONE 'Asia/Manila')::DATE,
    'Reversal of ' || v_entry.entry_number || ': ' || trim(p_reason),
    v_entry.reference_number,
    'reversing', 'posted',
    p_actor, p_actor, now(), v_entry.id
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  SELECT v_reversal_id, account_id, credit_amount, debit_amount, 'Reversal: ' || COALESCE(description, '')
  FROM public.journal_entry_lines WHERE journal_entry_id = v_entry.id;

  UPDATE public.journal_entries
  SET reversed_by_entry_id = v_reversal_id,
      reversed_at = now(),
      reversed_by = p_actor,
      reversal_reason = trim(p_reason)
  WHERE id = v_entry.id;

  RETURN v_reversal_id;
END;
$$;
REVOKE ALL ON FUNCTION public._reverse_journal_entry(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_entry_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_any_role(ARRAY['bookkeeper', 'treasurer']) THEN
    RAISE EXCEPTION 'Only the bookkeeper or treasurer can reverse journal entries';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_receipts r WHERE r.journal_entry_id = p_entry_id
    UNION ALL
    SELECT 1 FROM public.cash_disbursements d WHERE d.journal_entry_id = p_entry_id
  ) THEN
    RAISE EXCEPTION 'This entry belongs to a cash receipt or disbursement. Delete the transaction from Transactions so member records stay in sync.';
  END IF;
  RETURN public._reverse_journal_entry(p_entry_id, p_reason, public.current_staff_id());
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(p_entry JSONB, p_lines JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
  v_type TEXT := COALESCE(p_entry->>'entry_type', 'general');
  v_date DATE;
  v_description TEXT := trim(COALESCE(p_entry->>'description', ''));
  v_line JSONB;
  v_account RECORD;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_entry_id UUID;
  v_number TEXT;
BEGIN
  IF NOT public.has_any_role(ARRAY['bookkeeper', 'treasurer']) THEN
    RAISE EXCEPTION 'Only the bookkeeper or treasurer can post journal entries';
  END IF;
  IF v_type NOT IN ('general', 'adjusting') THEN
    RAISE EXCEPTION 'Entry type must be general or adjusting';
  END IF;
  IF v_description = '' THEN
    RAISE EXCEPTION 'A description is required';
  END IF;
  v_date := NULLIF(p_entry->>'entry_date', '')::DATE;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'An entry date is required';
  END IF;
  IF v_date > (now() AT TIME ZONE 'Asia/Manila')::DATE THEN
    RAISE EXCEPTION 'Entries cannot be dated in the future';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'At least two lines are required';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT id, is_active INTO v_account FROM public.chart_of_accounts WHERE id = NULLIF(v_line->>'account_id', '')::UUID;
    IF NOT FOUND OR NOT v_account.is_active THEN
      RAISE EXCEPTION 'Every line needs an active account';
    END IF;
    v_debit := ROUND(COALESCE(NULLIF(v_line->>'debit_amount', '')::NUMERIC, 0), 2);
    v_credit := ROUND(COALESCE(NULLIF(v_line->>'credit_amount', '')::NUMERIC, 0), 2);
    IF v_debit < 0 OR v_credit < 0 OR (v_debit > 0) = (v_credit > 0) THEN
      RAISE EXCEPTION 'Each line must have either a debit or a credit amount greater than zero';
    END IF;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Total debits (%) must equal total credits (%)', v_total_debit, v_total_credit;
  END IF;

  v_number := CASE WHEN v_type = 'adjusting' THEN 'AJE-' ELSE 'JE-' END
    || to_char(v_date, 'YYYY') || '-' || lpad(nextval('public.journal_entry_seq')::TEXT, 5, '0');

  INSERT INTO public.journal_entries (
    entry_number, entry_date, description, reference_number, entry_type, status,
    created_by, posted_by, posted_at
  ) VALUES (
    v_number, v_date, v_description, NULLIF(trim(COALESCE(p_entry->>'reference_number', '')), ''),
    v_type, 'posted', v_staff, v_staff, now()
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  SELECT v_entry_id,
         (l->>'account_id')::UUID,
         ROUND(COALESCE(NULLIF(l->>'debit_amount', '')::NUMERIC, 0), 2),
         ROUND(COALESCE(NULLIF(l->>'credit_amount', '')::NUMERIC, 0), 2),
         NULLIF(trim(COALESCE(l->>'description', '')), '')
  FROM jsonb_array_elements(p_lines) l;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(JSONB, JSONB) TO authenticated;

-- 5. Deleting a transaction reverses its journal entry instead of deleting it -----
CREATE OR REPLACE FUNCTION public.delete_cash_disbursement(p_disbursement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d RECORD;
  v_je_status TEXT;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can delete transactions';
  END IF;

  SELECT * INTO d FROM public.cash_disbursements WHERE id = p_disbursement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF d.loan_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.loan_payments WHERE loan_id = d.loan_id) THEN
    RAISE EXCEPTION 'Cannot delete: the loan released by this voucher already has payments. Delete those receipts first.';
  END IF;

  DELETE FROM public.member_activity
  WHERE reference = d.voucher_number AND activity_type IN ('loan_released', 'cash_disbursement')
    AND (member_id = d.member_id OR d.member_id IS NULL);

  DELETE FROM public.cash_disbursements WHERE id = d.id;
  IF d.loan_id IS NOT NULL THEN
    DELETE FROM public.loans WHERE id = d.loan_id;
  END IF;
  IF d.journal_entry_id IS NOT NULL THEN
    SELECT status INTO v_je_status FROM public.journal_entries WHERE id = d.journal_entry_id;
    IF v_je_status = 'posted' THEN
      PERFORM public._reverse_journal_entry(d.journal_entry_id, 'Disbursement ' || d.voucher_number || ' deleted', public.current_staff_id());
    ELSE
      DELETE FROM public.journal_entries WHERE id = d.journal_entry_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_cash_receipt(p_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  pay RECORD;
  sched RECORD;
  v_left NUMERIC;
  v_take NUMERIC;
  v_je_status TEXT;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can delete transactions';
  END IF;

  SELECT * INTO r FROM public.cash_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  FOR pay IN SELECT * FROM public.loan_payments WHERE receipt_id = r.id
  LOOP
    v_left := pay.amount_paid;
    FOR sched IN
      SELECT * FROM public.loan_schedule
      WHERE loan_id = pay.loan_id AND amount_paid > 0
      ORDER BY installment_number DESC
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, sched.amount_paid);
      UPDATE public.loan_schedule
      SET amount_paid = amount_paid - v_take,
          status = CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
          paid_at = NULL
      WHERE id = sched.id;
      v_left := v_left - v_take;
    END LOOP;

    UPDATE public.loans
    SET balance = LEAST(balance + pay.amount_paid, total_amount),
        status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
        updated_at = now()
    WHERE id = pay.loan_id;

    DELETE FROM public.loan_payments WHERE id = pay.id;
  END LOOP;

  DELETE FROM public.member_activity
  WHERE reference = r.receipt_number AND activity_type IN ('loan_payment', 'receipt')
    AND (member_id = r.member_id OR r.member_id IS NULL);
  DELETE FROM public.data_discrepancies WHERE source_type = 'cash_receipt' AND source_id = r.id;

  DELETE FROM public.cash_receipts WHERE id = r.id;
  IF r.journal_entry_id IS NOT NULL THEN
    SELECT status INTO v_je_status FROM public.journal_entries WHERE id = r.journal_entry_id;
    IF v_je_status = 'posted' THEN
      PERFORM public._reverse_journal_entry(r.journal_entry_id, 'Receipt ' || r.receipt_number || ' deleted', public.current_staff_id());
    ELSE
      DELETE FROM public.journal_entries WHERE id = r.journal_entry_id;
    END IF;
  END IF;
END;
$$;

-- 6. Read-side: ledger, balances, register -----------------------------------------
CREATE OR REPLACE FUNCTION public.staff_display_name(p_staff_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'chairman', 'manager'])
              THEN (SELECT COALESCE(NULLIF(full_name, ''), username) FROM public.staff WHERE id = p_staff_id)
         END;
$$;

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
  public.staff_display_name(je.reversed_by) AS reversed_by_name
FROM public.journal_entries je;

GRANT SELECT ON public.journal_entry_register TO authenticated;

CREATE OR REPLACE FUNCTION public.get_general_ledger(
  p_account_id UUID DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID, account_code TEXT, account_name TEXT, account_type TEXT,
  line_id UUID, entry_id UUID, entry_date DATE, entry_number TEXT, reference_number TEXT,
  entry_type TEXT, description TEXT, debit NUMERIC, credit NUMERIC, running_balance NUMERIC,
  is_opening BOOLEAN, is_reversed BOOLEAN, is_reversal BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH base AS (
    SELECT a.id AS aid, a.account_code AS acode, a.account_name AS aname, a.account_type AS atype,
           l.id AS lid, je.id AS eid, je.entry_date AS edate, je.entry_number AS enum,
           je.reference_number AS eref, je.entry_type AS etype, je.created_at AS ecreated,
           COALESCE(l.description, je.description) AS descr,
           l.debit_amount AS dr, l.credit_amount AS cr,
           (je.reversed_by_entry_id IS NOT NULL) AS rev,
           (je.reverses_entry_id IS NOT NULL) AS isrev,
           CASE WHEN a.account_type IN ('asset', 'expense')
                THEN l.debit_amount - l.credit_amount
                ELSE l.credit_amount - l.debit_amount END AS delta
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.status = 'posted'
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE p_account_id IS NULL OR a.id = p_account_id
  ),
  running AS (
    SELECT base.*, SUM(delta) OVER (PARTITION BY aid ORDER BY edate, ecreated, eid, lid) AS rb
    FROM base
  )
  SELECT aid, acode, aname, atype, lid, eid, edate, enum, eref, etype, descr, dr, cr, rb, opening, rev, isrev
  FROM (
    SELECT aid, acode, aname, atype, lid, eid, edate, enum, eref, etype, descr,
           dr, cr, rb, FALSE AS opening, rev, isrev, 1 AS sort_group
    FROM running
    WHERE (p_from IS NULL OR edate >= p_from) AND (p_to IS NULL OR edate <= p_to)
    UNION ALL
    SELECT aid, acode, aname, atype, NULL::UUID, NULL::UUID, p_from, NULL::TEXT, NULL::TEXT, NULL::TEXT,
           'Opening balance', 0::NUMERIC, 0::NUMERIC, SUM(delta), TRUE AS opening, FALSE, FALSE, 0
    FROM base
    WHERE p_from IS NOT NULL AND edate < p_from
    GROUP BY aid, acode, aname, atype
  ) t
  ORDER BY acode, sort_group, edate, enum, lid;
$$;

CREATE OR REPLACE FUNCTION public.get_account_balances(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS TABLE (
  account_id UUID, account_code TEXT, account_name TEXT, account_type TEXT,
  opening_balance NUMERIC, period_debit NUMERIC, period_credit NUMERIC, closing_balance NUMERIC,
  total_debit NUMERIC, total_credit NUMERIC
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.account_code, a.account_name, a.account_type,
    COALESCE(SUM(s.delta) FILTER (WHERE p_from IS NOT NULL AND s.edate < p_from), 0),
    COALESCE(SUM(s.dr) FILTER (WHERE (p_from IS NULL OR s.edate >= p_from) AND (p_to IS NULL OR s.edate <= p_to)), 0),
    COALESCE(SUM(s.cr) FILTER (WHERE (p_from IS NULL OR s.edate >= p_from) AND (p_to IS NULL OR s.edate <= p_to)), 0),
    COALESCE(SUM(s.delta) FILTER (WHERE p_to IS NULL OR s.edate <= p_to), 0),
    COALESCE(SUM(s.dr) FILTER (WHERE p_to IS NULL OR s.edate <= p_to), 0),
    COALESCE(SUM(s.cr) FILTER (WHERE p_to IS NULL OR s.edate <= p_to), 0)
  FROM public.chart_of_accounts a
  LEFT JOIN (
    SELECT l.account_id, je.entry_date AS edate, l.debit_amount AS dr, l.credit_amount AS cr,
           CASE WHEN ca.account_type IN ('asset', 'expense')
                THEN l.debit_amount - l.credit_amount
                ELSE l.credit_amount - l.debit_amount END AS delta
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.status = 'posted'
    JOIN public.chart_of_accounts ca ON ca.id = l.account_id
  ) s ON s.account_id = a.id
  GROUP BY a.id, a.account_code, a.account_name, a.account_type
  ORDER BY a.account_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_general_ledger(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balances(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_display_name(UUID) TO authenticated;

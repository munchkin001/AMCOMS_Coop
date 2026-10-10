-- Strict member validation in front of the receipt save, plus real delete/reversal for transactions.

ALTER FUNCTION public.save_cash_receipt(JSONB, JSONB) RENAME TO save_cash_receipt_core;
REVOKE ALL ON FUNCTION public.save_cash_receipt_core(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_cash_receipt(p_receipt JSONB, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_status TEXT := COALESCE(p_receipt->>'status', 'recorded');
  v_amount NUMERIC(15, 2) := COALESCE((p_receipt->>'amount')::NUMERIC, 0);
  v_member_id UUID := NULLIF(p_receipt->>'member_id', '')::UUID;
  v_from TEXT := lower(trim(COALESCE(p_receipt->>'received_from', '')));
  v_desc TEXT := COALESCE(p_receipt->>'description', '');
  v_is_loan BOOLEAN;
  m RECORD;
  v_loan RECORD;
  v_name_match UUID;
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can record cash receipts';
  END IF;

  IF v_member_id IS NOT NULL THEN
    SELECT * INTO m FROM public.members WHERE id = v_member_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not recorded: the selected member does not exist in the system.';
    END IF;
    IF m.membership_status <> 'active' OR m.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Not recorded: % is not an active member.', trim(concat_ws(' ', m.first_name, m.last_name));
    END IF;
    IF v_from NOT IN (
      lower(trim(concat_ws(' ', m.first_name, m.middle_name, m.last_name))),
      lower(trim(concat_ws(' ', m.first_name, m.last_name)))
    ) THEN
      RAISE EXCEPTION 'Not recorded: the name entered does not match the member record "%".',
        trim(concat_ws(' ', m.first_name, m.middle_name, m.last_name));
    END IF;
  ELSE
    SELECT id INTO v_name_match FROM public.members
    WHERE lower(trim(concat_ws(' ', first_name, middle_name, last_name))) = v_from
       OR lower(trim(concat_ws(' ', first_name, last_name))) = v_from
    LIMIT 1;
    IF v_name_match IS NOT NULL THEN
      RAISE EXCEPTION 'Not recorded: "%" is an existing member. Select the member from the list instead of typing the name.', trim(p_receipt->>'received_from');
    END IF;
  END IF;

  IF v_status = 'recorded' THEN
    v_is_loan := v_desc ~* 'loan' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_allocations) a
      WHERE a->>'account' = 'Loan Receivable' AND a->>'side' = 'credit'
    );

    IF v_is_loan THEN
      IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'Not recorded: a loan payment must be recorded against a member. Select the member from the list.';
      END IF;

      SELECT COALESCE(SUM(balance), 0) AS balance, COUNT(*) AS cnt, MIN(loan_number) AS loan_number
      INTO v_loan
      FROM public.loans WHERE member_id = v_member_id AND status = 'active' AND balance > 0;

      IF v_loan.cnt = 0 THEN
        RAISE EXCEPTION 'Not recorded: % has no active loan on record, so this loan payment cannot be applied.',
          trim(concat_ws(' ', m.first_name, m.last_name));
      END IF;
      IF v_amount > v_loan.balance + 0.009 THEN
        RAISE EXCEPTION 'Not recorded: the payment of % is more than the outstanding loan balance of % for %.',
          to_char(v_amount, 'FM999,999,990.00'), to_char(v_loan.balance, 'FM999,999,990.00'),
          trim(concat_ws(' ', m.first_name, m.last_name));
      END IF;
    END IF;
  END IF;

  RETURN public.save_cash_receipt_core(p_receipt, p_allocations);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cash_receipt(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_receipt(JSONB, JSONB) TO authenticated;

-- Delete a cash receipt and undo everything it did
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
    DELETE FROM public.journal_entries WHERE id = r.journal_entry_id;
  END IF;
END;
$$;

-- Delete a cash disbursement; a released loan can only be removed while it has no payments
CREATE OR REPLACE FUNCTION public.delete_cash_disbursement(p_disbursement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d RECORD;
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
    DELETE FROM public.journal_entries WHERE id = d.journal_entry_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cash_receipt(UUID), public.delete_cash_disbursement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cash_receipt(UUID), public.delete_cash_disbursement(UUID) TO authenticated;

-- Remove leftovers from receipts that no longer exist
DELETE FROM public.member_activity ma
WHERE ma.activity_type IN ('loan_payment', 'receipt')
  AND NOT EXISTS (SELECT 1 FROM public.cash_receipts r WHERE r.receipt_number = ma.reference);

DELETE FROM public.data_discrepancies dd
WHERE dd.source_type = 'cash_receipt'
  AND NOT EXISTS (SELECT 1 FROM public.cash_receipts r WHERE r.id = dd.source_id);

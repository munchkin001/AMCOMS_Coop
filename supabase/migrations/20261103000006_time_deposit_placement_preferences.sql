ALTER TABLE public.savings_accounts
  ADD COLUMN IF NOT EXISTS maturity_instruction TEXT NOT NULL DEFAULT 'release_principal_and_interest';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'savings_accounts_maturity_instruction_check'
      AND conrelid = 'public.savings_accounts'::regclass
  ) THEN
    ALTER TABLE public.savings_accounts
      ADD CONSTRAINT savings_accounts_maturity_instruction_check
      CHECK (maturity_instruction IN (
        'release_principal_and_interest',
        'renew_principal',
        'renew_principal_and_interest'
      ));
  END IF;
END;
$$;

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
  v_maturity_instruction TEXT := COALESCE(
    NULLIF(p_entry->>'maturity_instruction', ''),
    'release_principal_and_interest'
  );
BEGIN
  IF v_entry_type = 'time_deposit'
     AND v_maturity_instruction NOT IN (
       'release_principal_and_interest',
       'renew_principal',
       'renew_principal_and_interest'
     ) THEN
    RAISE EXCEPTION 'Choose a valid time-deposit maturity instruction';
  END IF;

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

  IF v_entry_type = 'time_deposit' THEN
    UPDATE public.savings_accounts AS account
    SET maturity_instruction = v_maturity_instruction
    FROM public.savings_transactions AS savings_tx
    WHERE savings_tx.receipt_id = v_receipt_id
      AND savings_tx.savings_account_id = account.id
      AND savings_tx.transaction_type = 'deposit'
      AND account.account_type = 'time_deposit';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The time-deposit account could not be linked to its maturity instruction';
    END IF;
  END IF;

  RETURN v_result || jsonb_build_object('receipt_number', v_receipt_number);
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_financial_entry(JSONB, JSONB, JSONB) TO authenticated;

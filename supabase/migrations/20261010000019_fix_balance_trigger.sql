-- Fix: plpgsql resolves both CASE branches, so use jsonb to read the entry id.
CREATE OR REPLACE FUNCTION public.check_journal_entry_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry_id UUID;
  v_entry RECORD;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_entry_id := (to_jsonb(NEW) ->> 'id')::UUID;
  ELSE
    v_entry_id := COALESCE(to_jsonb(NEW) ->> 'journal_entry_id', to_jsonb(OLD) ->> 'journal_entry_id')::UUID;
  END IF;

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

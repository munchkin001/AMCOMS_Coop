CREATE OR REPLACE FUNCTION public.manager_delete_draft_journal_entry(
  p_entry_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_entry public.journal_entries%ROWTYPE;
  v_actor UUID;
BEGIN
  IF NOT public.has_role('manager') THEN
    RAISE EXCEPTION 'Only an active manager can delete draft journal entries';
  END IF;
  IF p_entry_id IS NULL OR NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A draft entry and deletion reason are required';
  END IF;

  SELECT * INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;
  IF v_entry.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft journal entries can be deleted. Posted entries are protected.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_receipts WHERE journal_entry_id = v_entry.id)
     OR EXISTS (SELECT 1 FROM public.cash_disbursements WHERE journal_entry_id = v_entry.id)
     OR EXISTS (SELECT 1 FROM public.member_dividend_distributions WHERE journal_entry_id = v_entry.id) THEN
    RAISE EXCEPTION 'This draft is linked to a source transaction and cannot be deleted from the journal entry list';
  END IF;

  DELETE FROM public.journal_entries WHERE id = v_entry.id;

  SELECT id INTO v_actor FROM public.staff WHERE user_id = auth.uid();
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
  VALUES (
    v_actor,
    'Deleted draft journal entry: ' || trim(p_reason),
    'journal_entries',
    v_entry.id,
    to_jsonb(v_entry)
  );

  RETURN jsonb_build_object('deleted', true, 'entry_number', v_entry.entry_number);
END;
$$;

REVOKE ALL ON FUNCTION public.manager_delete_draft_journal_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_delete_draft_journal_entry(UUID, TEXT) TO authenticated;

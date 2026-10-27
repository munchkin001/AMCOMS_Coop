-- Allow database-owner sessions to remove posted journal entries for maintenance.
-- Application sessions remain subject to the posted-entry immutability guards.

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

ALTER TABLE public.archived_members
  ADD COLUMN IF NOT EXISTS member_number TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS date_joined DATE,
  ADD COLUMN IF NOT EXISTS previous_status TEXT;
UPDATE public.archived_members archive
SET member_number = COALESCE(archive.member_snapshot->>'member_number', member.member_number),
    first_name = COALESCE(archive.member_snapshot->>'first_name', member.first_name),
    middle_name = COALESCE(archive.member_snapshot->>'middle_name', member.middle_name),
    last_name = COALESCE(archive.member_snapshot->>'last_name', member.last_name),
    email = COALESCE(archive.member_snapshot->>'email', member.email),
    phone = COALESCE(archive.member_snapshot->>'phone', member.phone),
    address = COALESCE(archive.member_snapshot->>'address', member.address),
    date_joined = COALESCE(NULLIF(archive.member_snapshot->>'date_joined', '')::DATE, member.date_joined),
    previous_status = CASE
      WHEN member.archived_at IS NOT NULL AND member.archived_at = archive.archived_at THEN 'active'
      ELSE COALESCE(archive.member_snapshot->>'membership_status', member.membership_status, 'inactive')
    END
FROM public.members member
WHERE member.id = archive.member_id;
CREATE INDEX IF NOT EXISTS archived_members_member_number_idx
  ON public.archived_members(member_number);
CREATE INDEX IF NOT EXISTS archived_members_name_idx
  ON public.archived_members(last_name, first_name);
CREATE OR REPLACE FUNCTION public.bookkeeper_archive_member(p_member_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_review JSONB;
  v_member public.members%ROWTYPE;
  v_archive_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can archive members';
  END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'An archive reason is required';
  END IF;

  v_review := public.get_member_archive_review(p_member_id);
  IF (v_review->>'outstanding_loan_balance')::NUMERIC > 0 THEN
    RAISE EXCEPTION 'Member has outstanding loan obligations. Resolve or authorize them before archiving.';
  END IF;
  IF (v_review->>'pending_loan_count')::INTEGER > 0 THEN
    RAISE EXCEPTION 'Member has a loan application under review. Resolve it before archiving.';
  END IF;
  IF (v_review->>'unresolved_request_count')::INTEGER > 0 THEN
    RAISE EXCEPTION 'Member has unresolved requests. Review them before archiving.';
  END IF;

  UPDATE public.members
  SET membership_status = 'inactive',
      archived_at = timezone('utc'::text, now()),
      archived_by = v_staff_id,
      archive_reason = trim(p_reason)
  WHERE id = p_member_id
    AND membership_status = 'active'
    AND archived_at IS NULL
  RETURNING * INTO v_member;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member is not currently active'; END IF;

  INSERT INTO public.archived_members (
    member_id, member_snapshot, archived_at, archived_by, archive_reason,
    member_number, first_name, middle_name, last_name, email, phone, address,
    date_joined, previous_status
  ) VALUES (
    v_member.id, to_jsonb(v_member), v_member.archived_at, v_staff_id, trim(p_reason),
    v_member.member_number, v_member.first_name, v_member.middle_name, v_member.last_name,
    v_member.email, v_member.phone, v_member.address, v_member.date_joined, 'active'
  ) RETURNING id INTO v_archive_id;

  RETURN v_review || jsonb_build_object('archive_id', v_archive_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.bookkeeper_archive_member(UUID, TEXT) TO authenticated;

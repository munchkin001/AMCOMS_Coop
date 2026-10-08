CREATE OR REPLACE FUNCTION public.bookkeeper_reactivate_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id UUID := public.current_staff_id();
  member_record public.members%ROWTYPE;
  has_portal_account BOOLEAN;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only Bookkeepers can reactivate archived members';
  END IF;

  SELECT * INTO member_record
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  IF member_record.membership_status = 'suspended' THEN
    RAISE EXCEPTION 'Suspended members must be reinstated through the suspension review process';
  END IF;

  IF member_record.membership_status = 'inactive' OR member_record.archived_at IS NOT NULL THEN
    UPDATE public.members
    SET membership_status = 'active',
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_member_id;

    DELETE FROM public.archived_members
    WHERE member_id = p_member_id;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (
      actor_id,
      'MEMBER_REACTIVATED',
      'members',
      p_member_id,
      jsonb_build_object('event', 'MEMBER_REACTIVATED', 'member_number', member_record.member_number)
    );
  ELSIF member_record.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only archived members can be reactivated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.member_id = p_member_id AND s.role = 'member' AND s.user_id IS NOT NULL
  ) INTO has_portal_account;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'member_number', member_record.member_number,
    'has_portal_account', has_portal_account
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_reactivate_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_reactivate_member(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
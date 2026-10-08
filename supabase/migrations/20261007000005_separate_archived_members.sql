CREATE TABLE IF NOT EXISTS public.archived_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL UNIQUE REFERENCES public.members(id),
  member_snapshot JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  archived_by UUID REFERENCES public.staff(id),
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS archived_members_archived_at_idx
  ON public.archived_members(archived_at DESC);
ALTER TABLE public.archived_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view archived members" ON public.archived_members;
CREATE POLICY "Staff can view archived members"
  ON public.archived_members FOR SELECT
  USING (public.has_any_role(ARRAY['bookkeeper', 'manager', 'chairman', 'treasurer']));
GRANT SELECT ON public.archived_members TO authenticated;
DROP TRIGGER IF EXISTS audit_archived_members ON public.archived_members;
CREATE TRIGGER audit_archived_members
  AFTER INSERT OR UPDATE OR DELETE ON public.archived_members
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger();
INSERT INTO public.archived_members (member_id, member_snapshot, archived_at, archived_by, archive_reason)
SELECT
  m.id,
  to_jsonb(m),
  COALESCE(m.archived_at, m.updated_at, m.created_at, timezone('utc'::text, now())),
  m.archived_by,
  m.archive_reason
FROM public.members m
WHERE m.archived_at IS NOT NULL OR m.membership_status = 'inactive'
ON CONFLICT (member_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.bookkeeper_update_member(
  p_member_id UUID,
  p_member JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can edit member records';
  END IF;

  UPDATE public.members
  SET first_name = CASE WHEN p_member ? 'first_name' THEN trim(p_member->>'first_name') ELSE first_name END,
      middle_name = CASE WHEN p_member ? 'middle_name' THEN NULLIF(trim(p_member->>'middle_name'), '') ELSE middle_name END,
      last_name = CASE WHEN p_member ? 'last_name' THEN trim(p_member->>'last_name') ELSE last_name END,
      email = CASE WHEN p_member ? 'email' THEN NULLIF(lower(trim(p_member->>'email')), '') ELSE email END,
      phone = CASE WHEN p_member ? 'phone' THEN NULLIF(trim(p_member->>'phone'), '') ELSE phone END,
      address = CASE WHEN p_member ? 'address' THEN NULLIF(trim(p_member->>'address'), '') ELSE address END,
      date_of_birth = CASE WHEN p_member ? 'date_of_birth' THEN NULLIF(p_member->>'date_of_birth', '')::DATE ELSE date_of_birth END,
      gender = CASE WHEN p_member ? 'gender' THEN NULLIF(p_member->>'gender', '') ELSE gender END,
      emergency_contact_name = CASE WHEN p_member ? 'emergency_contact_name' THEN NULLIF(trim(p_member->>'emergency_contact_name'), '') ELSE emergency_contact_name END,
      emergency_contact_phone = CASE WHEN p_member ? 'emergency_contact_phone' THEN NULLIF(trim(p_member->>'emergency_contact_phone'), '') ELSE emergency_contact_phone END,
      family_members = CASE WHEN p_member ? 'family_members' THEN COALESCE(p_member->'family_members', '[]'::JSONB) ELSE family_members END,
      rsbsa = CASE WHEN p_member ? 'rsbsa' THEN NULLIF(trim(p_member->>'rsbsa'), '') ELSE rsbsa END,
      tin = CASE WHEN p_member ? 'tin' THEN NULLIF(trim(p_member->>'tin'), '') ELSE tin END,
      ncfrs = CASE WHEN p_member ? 'ncfrs' THEN NULLIF(trim(p_member->>'ncfrs'), '') ELSE ncfrs END,
      pca_id = CASE WHEN p_member ? 'pca_id' THEN NULLIF(trim(p_member->>'pca_id'), '') ELSE pca_id END,
      occupation = CASE WHEN p_member ? 'occupation' THEN NULLIF(trim(p_member->>'occupation'), '') ELSE occupation END,
      barangay = CASE WHEN p_member ? 'barangay' THEN NULLIF(trim(p_member->>'barangay'), '') ELSE barangay END,
      municipality = CASE WHEN p_member ? 'municipality' THEN NULLIF(trim(p_member->>'municipality'), '') ELSE municipality END,
      province = CASE WHEN p_member ? 'province' THEN NULLIF(trim(p_member->>'province'), '') ELSE province END
  WHERE id = p_member_id
    AND membership_status IN ('active', 'suspended')
    AND archived_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Member is archived or does not exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id AND (m.first_name = '' OR m.last_name = '' OR m.address IS NULL)
  ) THEN
    RAISE EXCEPTION 'First name, last name, and address are required';
  END IF;
END;
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'archived_members'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.archived_members;
  END IF;
END;
$$;
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

  INSERT INTO public.archived_members (member_id, member_snapshot, archived_at, archived_by, archive_reason)
  VALUES (v_member.id, to_jsonb(v_member), v_member.archived_at, v_staff_id, trim(p_reason))
  RETURNING id INTO v_archive_id;

  RETURN v_review || jsonb_build_object('archive_id', v_archive_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.bookkeeper_archive_member(UUID, TEXT) TO authenticated;

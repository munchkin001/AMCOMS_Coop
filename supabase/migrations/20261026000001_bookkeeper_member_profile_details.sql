ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS marital_status TEXT;

CREATE OR REPLACE FUNCTION public.bookkeeper_create_member_with_details(
  p_member JSONB,
  p_confirm_possible_duplicate BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID := public.current_staff_id();
  v_result JSONB;
  v_member_id UUID;
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can create member records';
  END IF;

  v_result := public.bookkeeper_create_member(p_member, p_confirm_possible_duplicate);
  IF COALESCE((v_result->>'possible_duplicate')::BOOLEAN, false) THEN
    RETURN v_result;
  END IF;

  v_member_id := NULLIF(v_result->>'id', '')::UUID;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Member creation did not return a member ID';
  END IF;

  UPDATE public.members
  SET marital_status = NULLIF(trim(COALESCE(p_member->>'marital_status', '')), ''),
      emergency_contact_relationship = NULLIF(trim(COALESCE(p_member->>'emergency_contact_relationship', '')), ''),
      additional_emergency_contacts = CASE
        WHEN jsonb_typeof(p_member->'additional_emergency_contacts') = 'array'
        THEN p_member->'additional_emergency_contacts'
        ELSE '[]'::JSONB
      END
  WHERE id = v_member_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_create_member_with_details(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_create_member_with_details(JSONB, BOOLEAN) TO authenticated;

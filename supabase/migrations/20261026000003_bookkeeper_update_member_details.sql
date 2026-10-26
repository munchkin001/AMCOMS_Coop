CREATE OR REPLACE FUNCTION public.bookkeeper_update_member_with_details(
  p_member_id UUID,
  p_member JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can edit member records';
  END IF;

  IF p_member ? 'shares_owned'
     AND NULLIF(p_member->>'shares_owned', '')::INTEGER < 0 THEN
    RAISE EXCEPTION 'Shares owned cannot be negative';
  END IF;
  IF p_member ? 'total_capital'
     AND NULLIF(p_member->>'total_capital', '')::NUMERIC < 0 THEN
    RAISE EXCEPTION 'Share capital cannot be negative';
  END IF;

  PERFORM public.bookkeeper_update_member(p_member_id, p_member);

  UPDATE public.members
  SET marital_status = CASE
        WHEN p_member ? 'marital_status' THEN NULLIF(trim(p_member->>'marital_status'), '')
        ELSE marital_status
      END,
      date_joined = CASE
        WHEN p_member ? 'date_joined' THEN NULLIF(p_member->>'date_joined', '')::DATE
        ELSE date_joined
      END,
      shares_owned = CASE
        WHEN p_member ? 'shares_owned' THEN NULLIF(p_member->>'shares_owned', '')::INTEGER
        ELSE shares_owned
      END,
      total_capital = CASE
        WHEN p_member ? 'total_capital' THEN NULLIF(p_member->>'total_capital', '')::NUMERIC(15, 2)
        ELSE total_capital
      END,
      emergency_contact_relationship = CASE
        WHEN p_member ? 'emergency_contact_relationship' THEN NULLIF(trim(p_member->>'emergency_contact_relationship'), '')
        ELSE emergency_contact_relationship
      END,
      additional_emergency_contacts = CASE
        WHEN jsonb_typeof(p_member->'additional_emergency_contacts') = 'array'
          THEN p_member->'additional_emergency_contacts'
        ELSE additional_emergency_contacts
      END
  WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeper_update_member_with_details(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeper_update_member_with_details(UUID, JSONB) TO authenticated;

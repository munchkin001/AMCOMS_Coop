ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_membership_type_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_membership_type_check
  CHECK (membership_type IN ('regular', 'associate'));

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
  v_current_email TEXT;
  v_membership_type TEXT := NULLIF(trim(p_member->>'membership_type'), '');
BEGIN
  IF v_staff_id IS NULL OR NOT public.has_role('bookkeeper') THEN
    RAISE EXCEPTION 'Only bookkeepers can edit member records';
  END IF;

  IF p_member ? 'membership_type' AND (
    v_membership_type IS NULL OR v_membership_type NOT IN ('regular', 'associate')
  ) THEN
    RAISE EXCEPTION 'Membership type must be regular or associate';
  END IF;

  SELECT lower(email) INTO v_current_email FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF p_member ? 'email' AND lower(NULLIF(trim(p_member->>'email'), '')) IS DISTINCT FROM v_current_email THEN
    RAISE EXCEPTION 'Email changes require a separate verified account update';
  END IF;

  UPDATE public.members
  SET first_name = CASE WHEN p_member ? 'first_name' THEN trim(p_member->>'first_name') ELSE first_name END,
      middle_name = CASE WHEN p_member ? 'middle_name' THEN NULLIF(trim(p_member->>'middle_name'), '') ELSE middle_name END,
      last_name = CASE WHEN p_member ? 'last_name' THEN trim(p_member->>'last_name') ELSE last_name END,
      membership_type = CASE WHEN p_member ? 'membership_type' THEN v_membership_type ELSE membership_type END,
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
    WHERE m.id = p_member_id
      AND (
        m.first_name = ''
        OR m.last_name = ''
        OR (m.address IS NULL AND m.membership_type <> 'associate')
      )
  ) THEN
    RAISE EXCEPTION 'First name and last name are required; regular members also need an address';
  END IF;
END;
$$;

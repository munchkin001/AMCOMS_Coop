-- Repairs member_applications on databases where the table was created without
-- the review columns, and makes sure approval creates the member + login.

ALTER TABLE public.member_applications
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_count      INTEGER;
  new_member_number TEXT;
  new_member_id     UUID;
  target_user_id    UUID;
  new_full_name     TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    new_full_name := concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name);

    target_user_id := NEW.user_id;
    IF target_user_id IS NULL THEN
      SELECT u.id INTO target_user_id
      FROM auth.users u
      WHERE lower(u.email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve: no account exists for %. The applicant must sign up first.', NEW.email;
    END IF;

    NEW.user_id := target_user_id;

    -- The cooperative has vetted the applicant, so they can sign in right away.
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = target_user_id;

    SELECT count(*) INTO member_count FROM public.members;
    new_member_number := 'M-' || to_char(CURRENT_DATE, 'YYYY')
                        || '-' || lpad((member_count + 1)::TEXT, 5, '0');

    INSERT INTO public.members (
      member_number,
      first_name, middle_name, last_name,
      email, phone, address,
      barangay, municipality, province,
      date_of_birth, gender, occupation,
      rsbsa, tin, ncfrs, pca_id,
      emergency_contact_name, emergency_contact_phone, family_members,
      membership_type, membership_status, date_joined,
      created_at, updated_at
    ) VALUES (
      new_member_number,
      NEW.first_name, NEW.middle_name, NEW.last_name,
      NEW.email, NEW.phone, NEW.address,
      NEW.barangay, NEW.municipality, NEW.province,
      NEW.date_of_birth, NEW.gender, NEW.occupation,
      NEW.rsbsa, NEW.tin, NEW.ncfrs, NEW.pca_id,
      NEW.emergency_contact_name, NEW.emergency_contact_phone,
      COALESCE(NEW.family_members, '[]'::jsonb),
      'regular', 'active',
      COALESCE(NEW.date_joined, CURRENT_DATE),
      now(), now()
    )
    RETURNING id INTO new_member_id;

    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id
    ) VALUES (
      target_user_id, NEW.email, NEW.email, new_full_name, 'member', true, new_member_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id = EXCLUDED.member_id,
          role      = 'member',
          is_active = true,
          full_name = EXCLUDED.full_name,
          email     = EXCLUDED.email;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_application_approved ON public.member_applications;
DROP TRIGGER IF EXISTS create_member_on_approval ON public.member_applications;
CREATE TRIGGER create_member_on_approval
  BEFORE UPDATE OF status ON public.member_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.create_member_from_application();

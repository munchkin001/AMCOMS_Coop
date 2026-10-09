-- If an approved applicant's email already belongs to a member (e.g. the
-- bookkeeper added them manually), link that member to the applicant's login
-- instead of failing on the unique email constraint.

CREATE OR REPLACE FUNCTION public.create_member_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_number       INTEGER;
  new_member_number TEXT;
  new_member_id     UUID;
  target_user_id    UUID;
  new_full_name     TEXT;
  year_prefix       TEXT := 'M-' || to_char(CURRENT_DATE, 'YYYY') || '-';
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

    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = target_user_id;

    SELECT id INTO new_member_id
    FROM public.members
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF new_member_id IS NOT NULL THEN
      UPDATE public.members
      SET membership_status = 'active',
          archived_at = NULL,
          updated_at = now()
      WHERE id = new_member_id;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('member_number'));
      SELECT COALESCE(MAX(substring(member_number FROM '(\d+)$')::INTEGER), 0) + 1
      INTO next_number
      FROM (
        SELECT member_number FROM public.members WHERE member_number LIKE year_prefix || '%'
        UNION ALL
        SELECT member_number FROM public.archived_members WHERE member_number LIKE year_prefix || '%'
      ) numbers;
      new_member_number := year_prefix || lpad(next_number::TEXT, 5, '0');

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
    END IF;

    INSERT INTO public.staff (
      user_id, username, email, full_name, role, is_active, member_id, must_change_password
    ) VALUES (
      target_user_id, NEW.email, NEW.email, new_full_name, 'member', true, new_member_id, false
    )
    ON CONFLICT (user_id) DO UPDATE
      SET member_id = EXCLUDED.member_id,
          role      = 'member',
          is_active = true,
          full_name = EXCLUDED.full_name,
          email     = EXCLUDED.email,
          must_change_password = false;
  END IF;

  RETURN NEW;
END;
$$;

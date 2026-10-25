BEGIN;

SELECT pg_advisory_xact_lock(hashtext('amcoms-member-account-number')::BIGINT);
SELECT pg_advisory_xact_lock(hashtext('amcoms-savings-account-number')::BIGINT);

LOCK TABLE public.members, public.archived_members, public.savings_accounts, public.staff
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE member_account_number_map ON COMMIT DROP AS
SELECT
  id,
  member_number AS old_number,
  lpad(row_number() OVER (ORDER BY created_at, id)::TEXT, 3, '0') AS new_number
FROM public.members;

CREATE TEMP TABLE savings_account_number_map ON COMMIT DROP AS
SELECT
  id,
  account_number AS old_number,
  lpad(row_number() OVER (ORDER BY created_at, id)::TEXT, 3, '0') AS new_number
FROM public.savings_accounts;

CREATE TEMP TABLE member_username_number_map ON COMMIT DROP AS
SELECT
  staff.id AS staff_id,
  member_numbers.new_number,
  'rn_' || substr(replace(staff.id::TEXT, '-', ''), 1, 24) AS temporary_username
FROM public.staff AS staff
JOIN member_account_number_map AS member_numbers
  ON member_numbers.id = staff.member_id
WHERE lower(staff.username) = lower(member_numbers.old_number);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM member_username_number_map AS moving
    JOIN public.staff AS existing
      ON lower(existing.username) = lower(moving.new_number)
     AND existing.id <> moving.staff_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM member_username_number_map AS other_moving
      WHERE other_moving.staff_id = existing.id
    )
  ) THEN
    RAISE EXCEPTION 'Cannot renumber member accounts: a new member number is already used as another staff username';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM member_username_number_map AS moving
    JOIN public.staff AS existing
      ON lower(existing.username) = lower(moving.temporary_username)
     AND existing.id <> moving.staff_id
  ) THEN
    RAISE EXCEPTION 'Cannot renumber member accounts: a temporary username conflicts with an existing username';
  END IF;
END;
$$;

UPDATE public.staff AS staff
SET username = moving.temporary_username,
    updated_at = timezone('utc'::TEXT, now())
FROM member_username_number_map AS moving
WHERE staff.id = moving.staff_id;

UPDATE public.members AS member
SET member_number = 'renumber-' || replace(member.id::TEXT, '-', '')
FROM member_account_number_map AS number_map
WHERE member.id = number_map.id;

UPDATE public.savings_accounts AS account
SET account_number = 'renumber-' || replace(account.id::TEXT, '-', '')
FROM savings_account_number_map AS number_map
WHERE account.id = number_map.id;

UPDATE public.members AS member
SET member_number = number_map.new_number
FROM member_account_number_map AS number_map
WHERE member.id = number_map.id;

UPDATE public.archived_members AS archive
SET member_number = number_map.new_number,
    member_snapshot = jsonb_set(
      archive.member_snapshot,
      '{member_number}',
      to_jsonb(number_map.new_number),
      true
    )
FROM member_account_number_map AS number_map
WHERE archive.member_id = number_map.id;

UPDATE public.savings_accounts AS account
SET account_number = number_map.new_number
FROM savings_account_number_map AS number_map
WHERE account.id = number_map.id;

UPDATE public.staff AS staff
SET username = moving.new_number,
    updated_at = timezone('utc'::TEXT, now())
FROM member_username_number_map AS moving
WHERE staff.id = moving.staff_id;

COMMIT;

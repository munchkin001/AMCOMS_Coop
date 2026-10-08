DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_email_format_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_email_format_check
      CHECK (
        email IS NULL
        OR btrim(email) = ''
        OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      ) NOT VALID;
  END IF;
END;
$$;

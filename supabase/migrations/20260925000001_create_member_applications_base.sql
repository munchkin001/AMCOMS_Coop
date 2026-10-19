BEGIN;

CREATE TABLE IF NOT EXISTS public.member_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  application_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  reviewed_date TIMESTAMP WITHOUT TIME ZONE,
  reviewed_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE public.member_applications ENABLE ROW LEVEL SECURITY;

COMMIT;

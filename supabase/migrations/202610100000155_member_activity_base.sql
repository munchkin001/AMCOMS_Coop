BEGIN;

CREATE TABLE IF NOT EXISTS public.member_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC,
  reference TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_discrepancy BOOLEAN NOT NULL DEFAULT false,
  note TEXT
);

CREATE INDEX IF NOT EXISTS member_activity_member_idx
  ON public.member_activity (member_id, created_at DESC);

ALTER TABLE public.member_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own activity" ON public.member_activity;
CREATE POLICY "Members can view own activity"
  ON public.member_activity FOR SELECT
  USING (member_id = public.get_member_id());

DROP POLICY IF EXISTS "Staff can view member activity" ON public.member_activity;
CREATE POLICY "Staff can view member activity"
  ON public.member_activity FOR SELECT
  USING (
    public.has_any_role(
      ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']::TEXT[]
    )
  );

COMMIT;

BEGIN;

-- Keep member-facing history limited to share changes, not full audit snapshots.

CREATE TABLE IF NOT EXISTS public.member_share_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  shares_change INTEGER NOT NULL,
  shares_after INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('opening', 'adjustment')),
  description TEXT NOT NULL,
  source_audit_id UUID UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_share_history_member_occurred_idx
  ON public.member_share_history (member_id, occurred_at DESC);

WITH share_audit AS (
  SELECT
    al.id AS audit_id,
    al.record_id AS member_id,
    al.created_at,
    CASE
      WHEN COALESCE(al.old_data->>'shares_owned', '') ~ '^-?[0-9]+$'
        THEN (al.old_data->>'shares_owned')::INTEGER
      ELSE 0
    END AS shares_before,
    (al.new_data->>'shares_owned')::INTEGER AS shares_after,
    COALESCE(al.old_data ? 'shares_owned', false) AS has_old_shares
  FROM public.audit_logs al
  WHERE al.table_name = 'members'
    AND al.record_id IS NOT NULL
    AND al.new_data ? 'shares_owned'
    AND COALESCE(al.new_data->>'shares_owned', '') ~ '^-?[0-9]+$'
),
first_events AS (
  SELECT
    sa.*,
    row_number() OVER (PARTITION BY sa.member_id ORDER BY sa.created_at, sa.audit_id) AS event_number
  FROM share_audit sa
)
INSERT INTO public.member_share_history (
  member_id, shares_change, shares_after, entry_type, description, occurred_at
)
SELECT
  member_id,
  shares_before,
  shares_before,
  'opening',
  'Opening share balance from the first available audit record',
  created_at - INTERVAL '1 microsecond'
FROM first_events
WHERE event_number = 1
  AND has_old_shares
  AND NOT EXISTS (
    SELECT 1
    FROM public.member_share_history history
    WHERE history.member_id = first_events.member_id
      AND history.entry_type = 'opening'
      AND history.occurred_at = first_events.created_at - INTERVAL '1 microsecond'
  );

WITH share_audit AS (
  SELECT
    al.id AS audit_id,
    al.record_id AS member_id,
    al.created_at,
    CASE
      WHEN COALESCE(al.old_data->>'shares_owned', '') ~ '^-?[0-9]+$'
        THEN (al.old_data->>'shares_owned')::INTEGER
      ELSE 0
    END AS shares_before,
    (al.new_data->>'shares_owned')::INTEGER AS shares_after,
    COALESCE(al.old_data ? 'shares_owned', false) AS has_old_shares
  FROM public.audit_logs al
  WHERE al.table_name = 'members'
    AND al.record_id IS NOT NULL
    AND al.new_data ? 'shares_owned'
    AND COALESCE(al.new_data->>'shares_owned', '') ~ '^-?[0-9]+$'
)
INSERT INTO public.member_share_history (
  member_id, shares_change, shares_after, entry_type, description, source_audit_id, occurred_at
)
SELECT
  member_id,
  shares_after - shares_before,
  shares_after,
  CASE WHEN has_old_shares THEN 'adjustment' ELSE 'opening' END,
  CASE
    WHEN has_old_shares THEN 'Shares owned adjusted'
    ELSE 'Opening share balance recorded'
  END,
  audit_id,
  created_at
FROM share_audit
WHERE shares_after <> shares_before
   OR NOT has_old_shares
ON CONFLICT (source_audit_id) DO NOTHING;

INSERT INTO public.member_share_history (
  member_id, shares_change, shares_after, entry_type, description, occurred_at
)
SELECT
  m.id,
  COALESCE(m.shares_owned, 0),
  COALESCE(m.shares_owned, 0),
  'opening',
  'Current share balance at history setup; earlier changes are not available',
  now()
FROM public.members m
WHERE NOT EXISTS (
  SELECT 1
  FROM public.member_share_history history
  WHERE history.member_id = m.id
);

CREATE OR REPLACE FUNCTION public.record_member_share_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_share_history (
      member_id, shares_change, shares_after, entry_type, description, occurred_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.shares_owned, 0),
      COALESCE(NEW.shares_owned, 0),
      'opening',
      'Initial share balance recorded',
      clock_timestamp()
    );
  ELSIF NEW.shares_owned IS DISTINCT FROM OLD.shares_owned THEN
    INSERT INTO public.member_share_history (
      member_id, shares_change, shares_after, entry_type, description, occurred_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.shares_owned, 0) - COALESCE(OLD.shares_owned, 0),
      COALESCE(NEW.shares_owned, 0),
      'adjustment',
      format(
        'Shares owned adjusted from %s to %s',
        COALESCE(OLD.shares_owned, 0),
        COALESCE(NEW.shares_owned, 0)
      ),
      clock_timestamp()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_member_share_history ON public.members;
CREATE TRIGGER record_member_share_history
  AFTER INSERT OR UPDATE OF shares_owned ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.record_member_share_history();

REVOKE ALL ON FUNCTION public.record_member_share_history() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.member_share_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own share history" ON public.member_share_history;
CREATE POLICY "Members can view own share history"
  ON public.member_share_history FOR SELECT TO authenticated
  USING (member_id = public.get_member_id());

DROP POLICY IF EXISTS "Financial staff can view share history" ON public.member_share_history;
CREATE POLICY "Financial staff can view share history"
  ON public.member_share_history FOR SELECT TO authenticated
  USING (
    public.has_any_role(ARRAY['bookkeeper', 'treasurer', 'manager', 'chairman']::TEXT[])
  );

REVOKE INSERT, UPDATE, DELETE ON public.member_share_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_share_history TO authenticated;

COMMIT;

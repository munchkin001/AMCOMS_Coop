-- Managers retain read-only access to member records. Member changes are
-- permitted only through the existing bookkeeper-only security-definer RPCs.
DROP POLICY IF EXISTS "Manager can manage members" ON public.members;

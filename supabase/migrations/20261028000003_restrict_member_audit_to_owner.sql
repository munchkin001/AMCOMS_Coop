DROP POLICY IF EXISTS "Chairman and manager can view member audit logs"
  ON public.member_audit_logs;

DROP POLICY IF EXISTS "Members can view own audit logs"
  ON public.member_audit_logs;
CREATE POLICY "Members can view own audit logs"
  ON public.member_audit_logs FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

REVOKE ALL ON public.member_audit_logs FROM PUBLIC, anon;
GRANT SELECT ON public.member_audit_logs TO authenticated;

NOTIFY pgrst, 'reload schema';

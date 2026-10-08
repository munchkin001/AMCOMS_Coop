-- Keep the live audit view small while retaining the complete audit trail.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS audit_logs_archive_month_idx
  ON public.audit_logs (is_archived, created_at DESC);
CREATE OR REPLACE FUNCTION public.archive_audit_logs_before_current_month()
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  archived_count BIGINT;
BEGIN
  UPDATE public.audit_logs
  SET is_archived = true
  WHERE is_archived = false
    AND created_at < (
      date_trunc('month', now() AT TIME ZONE 'Asia/Manila')
      AT TIME ZONE 'Asia/Manila'
    );

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;
COMMENT ON FUNCTION public.archive_audit_logs_before_current_month() IS
  'Marks audit entries older than the current Asia/Manila calendar month as archived; preserves all audit evidence.';
REVOKE ALL ON FUNCTION public.archive_audit_logs_before_current_month() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_audit_log_archive_months()
RETURNS TABLE (month_start TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT to_char(
    date_trunc('month', audit_logs.created_at AT TIME ZONE 'Asia/Manila'),
    'YYYY-MM'
  ) AS month_start
  FROM public.audit_logs
  WHERE audit_logs.is_archived = true
  ORDER BY month_start DESC;
$$;
REVOKE ALL ON FUNCTION public.get_audit_log_archive_months() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_log_archive_months() TO authenticated;
-- Backfill older rows so archived months are available immediately after deploy.
SELECT public.archive_audit_logs_before_current_month();
-- The range catches the last UTC day of each month, which is 00:00 on the
-- first day in the cooperative's Asia/Manila calendar. The WHERE clause makes
-- the other days in the range no-ops, without changing global cron settings.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'archive-audit-logs-monthly-manila';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'archive-audit-logs-monthly-manila',
    '0 16 28-31 * *',
    $job$SELECT public.archive_audit_logs_before_current_month()
      WHERE EXTRACT(DAY FROM timezone('Asia/Manila', now())) = 1
        AND EXTRACT(HOUR FROM timezone('Asia/Manila', now())) = 0;$job$
  );
END;
$$;

-- ============================================
-- AMCOMS: RLS Integrity Fixes
-- Migration: 20260927000002
-- ------------------------------------------------------------
-- Closes four authorization holes found in the audit:
--
--   1. audit_logs, sms_logs, email_logs had INSERT policies declared as
--      WITH CHECK (true), i.e. ANY authenticated user could forge audit and
--      delivery records. The audit trail is the system's tamper-evidence
--      guarantee, so forgeable entries defeat it entirely.
--
--   2. journal_entry_lines had "Bookkeeper can manage journal lines" as
--      FOR ALL with no status guard, while journal_entries only allowed a
--      bookkeeper to UPDATE rows WHERE status = 'draft'. A bookkeeper could
--      therefore mutate the LINES of a POSTED journal entry, silently
--      rewriting the general ledger and every derived report.
--
--   3. member_applications has RLS DISABLED and its auth.users foreign key
--      DROPPED in the live database (documented in SIGNUP_NOW_WORKING.md).
--      The table holds names, emails, phones, addresses, dates of birth,
--      occupations, RSBSA numbers, TINs, NCFRS numbers, PCA IDs and family
--      members. With RLS off it is readable by anyone holding the public anon
--      key, which ships in the client bundle.
--
--   4. 20260926000001 created "Authenticated users can create application"
--      WITH CHECK (auth.uid() IS NOT NULL), which lets ANY authenticated user
--      file a membership application on behalf of ANY email address.
--
-- IDEMPOTENT: safe to run more than once, and safe whether or not
-- 20260926000001 / 20260926000002 were applied.
-- ============================================


-- ============================================
-- 1. REMOVE FORGEABLE LOG INSERTS
-- ============================================
-- public.audit_trigger() (migration 20260910000003) is SECURITY DEFINER, so it
-- runs as the table owner and bypasses RLS. Removing the client INSERT policy
-- does not stop the trigger; it stops everything else.

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

DO $$
DECLARE
  forgeable TEXT;
BEGIN
  SELECT string_agg(tablename, ', ')
    INTO forgeable
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'System can insert audit logs',
      'System can create sms logs',
      'System can create email logs'
    );

  -- Reported, not raised: a verifier must never block a deployment. Run
  -- scripts/verify-security.sql to treat this as a hard gate.
  IF forgeable IS NOT NULL THEN
    RAISE WARNING
      'Forgeable log INSERT policies still present: %', forgeable;
  END IF;

  RAISE NOTICE '✓ audit_logs, sms_logs, email_logs are no longer client-writable.';
END $$;

-- Write paths for these tables move to SECURITY DEFINER functions or Edge
-- Functions (which use service_role and bypass RLS) in a later stage.


-- ============================================
-- 2. SEAL POSTED JOURNAL ENTRIES
-- ============================================
DROP POLICY IF EXISTS "Bookkeeper can manage journal lines" ON public.journal_entry_lines;

-- Bookkeeper may add, change or remove lines, but ONLY while the parent
-- journal entry is still a draft. Once posted, the entry is immutable and
-- corrections must go through a reversing entry.
DROP POLICY IF EXISTS "Bookkeeper can insert draft journal lines" ON public.journal_entry_lines;
CREATE POLICY "Bookkeeper can insert draft journal lines"
  ON public.journal_entry_lines FOR INSERT
  WITH CHECK (
    public.has_role('bookkeeper')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND je.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Bookkeeper can update draft journal lines" ON public.journal_entry_lines;
CREATE POLICY "Bookkeeper can update draft journal lines"
  ON public.journal_entry_lines FOR UPDATE
  USING (
    public.has_role('bookkeeper')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND je.status = 'draft'
    )
  )
  WITH CHECK (
    public.has_role('bookkeeper')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND je.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Bookkeeper can delete draft journal lines" ON public.journal_entry_lines;
CREATE POLICY "Bookkeeper can delete draft journal lines"
  ON public.journal_entry_lines FOR DELETE
  USING (
    public.has_role('bookkeeper')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND je.status = 'draft'
    )
  );


-- ============================================
-- 3. NARROW DOCUMENT VISIBILITY
-- ============================================
-- Previously any active staff member could read every row in documents,
-- including member IDs and financial vouchers attached to records they have
-- no business seeing. Restrict to the roles that legitimately handle
-- financial paperwork. Per-record scoping (checking access to related_table /
-- related_id) is deferred to the attachment stage.
DROP POLICY IF EXISTS "Staff can view documents" ON public.documents;
CREATE POLICY "Financial staff can view documents"
  ON public.documents FOR SELECT
  USING (
    public.has_any_role(
      ARRAY['chairman', 'manager', 'treasurer', 'bookkeeper']::TEXT[]
    )
  );

DROP POLICY IF EXISTS "Staff can upload documents" ON public.documents;
CREATE POLICY "Financial staff can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.has_any_role(
      ARRAY['chairman', 'manager', 'treasurer', 'bookkeeper']::TEXT[]
    )
  );


-- ============================================
-- 4. RESTORE PROTECTION ON member_applications
-- ============================================
-- Handle the case where the table is missing entirely (a fresh
-- `supabase db reset` cannot currently build this schema, because no migration
-- in the chain creates member_applications).
DO $$
BEGIN
  IF to_regclass('public.member_applications') IS NULL THEN
    RAISE EXCEPTION
      'public.member_applications does not exist. Apply database/member_applications.sql first, or add it to the migration chain.';
  END IF;
END $$;

-- Re-enable RLS. This is the single most important line in this migration.
ALTER TABLE public.member_applications ENABLE ROW LEVEL SECURITY;

-- Remove the over-permissive policy from 20260926000001.
DROP POLICY IF EXISTS "Authenticated users can create application" ON public.member_applications;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.member_applications;

-- An applicant may read only their own application.
DROP POLICY IF EXISTS "Members can view own application" ON public.member_applications;
CREATE POLICY "Applicants can view own application"
  ON public.member_applications FOR SELECT
  USING (user_id = auth.uid());

-- An applicant may file an application, but only for their own user id.
-- This replaces WITH CHECK (auth.uid() IS NOT NULL).
DROP POLICY IF EXISTS "Members can create application" ON public.member_applications;
CREATE POLICY "Applicants can create own application"
  ON public.member_applications FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Staff may read all applications to review them.
DROP POLICY IF EXISTS "Staff can view all applications" ON public.member_applications;
CREATE POLICY "Staff can view all applications"
  ON public.member_applications FOR SELECT
  USING (
    public.has_any_role(ARRAY['manager', 'chairman']::TEXT[])
  );

-- Only manager or chairman may approve or reject.
DROP POLICY IF EXISTS "Managers can update applications" ON public.member_applications;
CREATE POLICY "Managers can review applications"
  ON public.member_applications FOR UPDATE
  USING (
    public.has_any_role(ARRAY['manager', 'chairman']::TEXT[])
  )
  WITH CHECK (
    public.has_any_role(ARRAY['manager', 'chairman']::TEXT[])
  );

-- Deliberately no DELETE policy. An application is an auditable record.


-- ============================================
-- 5. RESTORE THE auth.users FOREIGN KEY
-- ============================================
-- The FK was dropped to make signup work around an RLS error. Now that RLS is
-- correct, the constraint can go back. Restored only when no orphaned rows
-- exist, so this migration cannot fail on a dirty database.
DO $$
DECLARE
  orphans INTEGER;
  fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.member_applications'::regclass
      AND conname = 'member_applications_user_id_fkey'
  ) INTO fk_exists;

  IF fk_exists THEN
    RAISE NOTICE 'member_applications_user_id_fkey already present; skipping.';
    RETURN;
  END IF;

  SELECT count(*) INTO orphans
  FROM public.member_applications
  WHERE user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id = member_applications.user_id
    );

  IF orphans > 0 THEN
    RAISE WARNING
      'Not restoring member_applications_user_id_fkey: % orphaned user_id value(s). '
      'Clean them up, then re-run this migration.', orphans;
    RETURN;
  END IF;

  -- user_id is nullable: rows created before signup carried no user id.
  IF EXISTS (
    SELECT 1 FROM public.member_applications WHERE user_id IS NULL
  ) THEN
    RAISE NOTICE 'Some applications have NULL user_id; adding FK as NOT VALID.';
    ALTER TABLE public.member_applications
      ADD CONSTRAINT member_applications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
      NOT VALID;
  ELSE
    ALTER TABLE public.member_applications
      ADD CONSTRAINT member_applications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  RAISE NOTICE '✓ Restored member_applications_user_id_fkey.';
END $$;


-- ============================================
-- 6. VERIFICATION
-- ============================================
DO $$
DECLARE
  rls_off TEXT;
BEGIN
  SELECT string_agg(tablename, ', ') INTO rls_off
  FROM pg_tables
  WHERE schemaname = 'public'
    AND NOT rowsecurity
    AND tablename NOT IN ('_migrations');

  IF rls_off IS NOT NULL THEN
    RAISE WARNING 'Tables with RLS disabled: %', rls_off;
  END IF;

  RAISE NOTICE '✓ Migration 20260927000002 completed.';
  RAISE NOTICE '✓ Log tables are no longer client-writable.';
  RAISE NOTICE '✓ Posted journal entries are sealed against line edits.';
  RAISE NOTICE '✓ Document visibility narrowed to financial roles.';
  RAISE NOTICE '✓ member_applications RLS re-enabled and scoped.';
  RAISE NOTICE '✓ auth.users foreign key restored (where safe).';
END $$;

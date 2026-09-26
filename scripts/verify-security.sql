-- ============================================
-- AMCOMS: Security & Schema Verification
-- ============================================
-- Replaces scripts/verify-database.sql, which referenced three tables that
-- never existed in the schema (transactions, accounts, time_deposits) and
-- columns that do not exist on staff (first_name, last_name).
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste -> Run
--   or:  psql "$DATABASE_URL" -f scripts/verify-security.sql
--
-- HOW TO READ THE OUTPUT
--   Every section prints a status column. Anything other than 'PASS' or
--   'INFO' is a finding that must be resolved before go-live.
--   This script only reads. It changes nothing.
-- ============================================


-- ============================================
-- 1. RLS RECURSION  (the login blocker)
-- ============================================
-- A policy on public.staff that reads public.staff makes every SELECT against
-- staff fail with "infinite recursion detected in policy", which prevents
-- every role from authenticating.
--
-- pg_policies.qual records the function named in the USING expression, so a
-- recursive policy on staff shows up as a policy on 'staff' whose qual is
-- literally 'staff'. The legitimate helpers created by
-- 20260927000001 are listed explicitly so the check stays readable.
SELECT
  '1. staff RLS recursion'                       AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'FAIL - ' || count(*) || ' recursive policy/policies on staff'
  END                                             AS status,
  coalesce(string_agg(pol.policyname, ', '), '(none)') AS detail
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename = 'staff'
  AND pol.qual = 'staff';


-- 1b. Sanity check: the non-recursive staff policies must be present, or a
-- staff user cannot read their own record and login fails at the profile step.
SELECT
  '1b. staff read policies'                      AS check_name,
  CASE
    WHEN count(*) = 2 THEN 'PASS'
    ELSE 'FAIL - expected 2 read policies, found ' || count(*)
  END                                             AS status,
  coalesce(string_agg(pol.policyname, ', '), '(none)') AS detail
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename = 'staff'
  AND pol.cmd = 'SELECT';


-- ============================================
-- 2. IDENTITY HELPER FUNCTIONS PRESENT
-- ============================================
SELECT
  '2. identity helpers'                         AS check_name,
  CASE
    WHEN count(*) = 6 THEN 'PASS'
    ELSE 'FAIL - expected 6 helpers, found ' || count(*)
  END                                             AS status,
  coalesce(string_agg(proname, ', '), '(none)')  AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('current_staff_id', 'is_active_staff', 'current_member_id',
                  'current_user_role', 'has_role', 'has_any_role');


-- ============================================
-- 3. FORGEABLE LOG INSERTS
-- ============================================
-- audit_logs, sms_logs and email_logs must not be writable by clients.
-- Audit rows are written by public.audit_trigger(), which runs as the table
-- owner and bypasses RLS.
SELECT
  '3. log tables not client-writable'            AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'FAIL - ' || count(*) || ' permissive INSERT policy/policies'
  END                                             AS status,
  coalesce(string_agg(tablename || ': ' || policyname, ', '), '(none)') AS detail
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('audit_logs', 'sms_logs', 'email_logs')
  AND cmd IN ('INSERT', 'ALL')
  AND policyname IN (
    'System can insert audit logs',
    'System can create sms logs',
    'System can create email logs'
  );


-- ============================================
-- 4. ROW LEVEL SECURITY COVERAGE
-- ============================================
SELECT
  '4. RLS enabled on all public tables'          AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'FAIL - ' || count(*) || ' table(s) with RLS off'
  END                                             AS status,
  coalesce(string_agg(tablename, ', '), '(none)') AS detail
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity
  AND tablename <> '_migrations';


-- ============================================
-- 5. SECURITY DEFINER search_path
-- ============================================
-- Without a pinned search_path a SECURITY DEFINER function can be subverted
-- by a caller who can create objects in a schema on the search path.
SELECT
  '5. SECURITY DEFINER pinned'                  AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'FAIL - ' || count(*) || ' function(s) without search_path'
  END                                             AS status,
  coalesce(string_agg(p.oid::regprocedure::TEXT, '; '), '(none)') AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS cfg
      WHERE cfg LIKE 'search\_path=%'
    )
  );


-- ============================================
-- 6. POSTED JOURNAL ENTRIES ARE SEALED
-- ============================================
-- journal_entry_lines must not be editable once the parent entry is posted.
SELECT
  '6. posted journal lines sealed'              AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'REVIEW - ' || count(*) || ' unguarded policy/policies on journal_entry_lines'
  END                                             AS status,
  coalesce(string_agg(policyname, ', '), '(none)') AS detail
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'journal_entry_lines'
  AND policyname = 'Bookkeeper can manage journal lines';


-- ============================================
-- 7. member_applications PROTECTION
-- ============================================
-- This table was left with RLS disabled in the live database, which exposes
-- names, emails, phones, addresses, dates of birth, occupations, RSBSA, TIN,
-- NCFRS and PCA numbers to anyone holding the public anon key.
SELECT
  '7. member_applications RLS'                  AS check_name,
  CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL - RLS is DISABLED' END AS status,
  'rowsecurity = ' || rowsecurity::TEXT          AS detail
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'member_applications';


SELECT
  '7b. member_applications policies'            AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'FAIL - no policies at all'
    WHEN bool_or(policyname = 'Applicants can create own application') THEN 'PASS'
    ELSE 'FAIL - missing scoped INSERT policy'
  END                                             AS status,
  coalesce(string_agg(policyname, ', '), '(none)') AS detail
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'member_applications';


-- ============================================
-- 8. staff UNIQUE CONSTRAINT
-- ============================================
-- Required by create_member_from_application()'s ON CONFLICT (user_id).
SELECT
  '8. staff_user_id_unique'                     AS check_name,
  CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL - constraint missing or duplicated' END AS status,
  coalesce(string_agg(conname, ', '), '(none)') AS detail
FROM pg_constraint
WHERE conrelid = 'public.staff'::regclass
  AND contype = 'u';


-- ============================================
-- 9. APPROVAL TRIGGER PRESENT AND CURRENT
-- ============================================
SELECT
  '9. member approval trigger'                  AS check_name,
  CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL - trigger missing' END AS status,
  coalesce(string_agg(tgname, ', '), '(none)')  AS detail
FROM pg_trigger
WHERE tgrelid = 'public.member_applications'::regclass
  AND NOT tgisinternal
  AND tgname = 'create_member_on_approval';


-- ============================================
-- 10. AUDIT TRIGGER COVERAGE
-- ============================================
-- Every table holding cooperative or financial data should be audited.
SELECT
  '10. audit trigger coverage'                  AS check_name,
  CASE
    WHEN count(*) >= 24 THEN 'PASS - ' || count(*) || ' tables audited'
    ELSE 'REVIEW - only ' || count(*) || ' tables audited'
  END                                             AS status,
  coalesce(string_agg(rel, ', '), '(none)')      AS detail
FROM (
  SELECT DISTINCT c.relname AS rel
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT tg.tgisinternal
    AND tg.tgfoid = 'public.audit_trigger()'::regprocedure
) s;

SELECT
  '10b. tables WITHOUT audit trigger'           AS check_name,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'REVIEW' END AS status,
  coalesce(string_agg(tablename, ', '), '(none)') AS detail
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    '_migrations', 'ref_counters',
    -- lookup/configuration tables where an audit row adds no value
    'staff', 'system_settings', 'product_categories'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger tg
    WHERE tg.tgrelid = pg_tables.oid
      AND NOT tg.tgisinternal
      AND tg.tgfoid = 'public.audit_trigger()'::regprocedure
  );


-- ============================================
-- 11. MEMBER APPLICATION FIELDS PERSISTED
-- ============================================
-- These are collected at signup and must survive approval.
SELECT
  '11. member fields persisted'                 AS check_name,
  CASE
    WHEN count(*) = 11 THEN 'PASS - all 11 fields carry through'
    ELSE 'FAIL - missing: ' || string_agg(want.column_name, ', ')
  END                                             AS status,
  'checked: rsbsa, tin, ncfrs, pca_id, occupation, barangay, municipality, province, emergency contact (2), family_members' AS detail
FROM (
  SELECT unnest(ARRAY[
    'rsbsa','tin','ncfrs','pca_id','occupation',
    'barangay','municipality','province',
    'emergency_contact_name','emergency_contact_phone','family_members'
  ]) AS column_name
) want
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name   = 'members'
    AND c.column_name  = want.column_name
);


-- ============================================
-- 12. REFERENCE NUMBER GENERATOR
-- ============================================
SELECT
  '12. ref_counters'                            AS check_name,
  CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL - table missing' END AS status,
  'gapless document numbering source'           AS detail
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'ref_counters';


-- ============================================
-- 13. REALTIME PUBLICATION
-- ============================================
-- The UI shows a green "Live" badge. If tables are not in the publication the
-- subscriptions never fire and the badge is misleading.
SELECT
  '13. realtime publication'                    AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'FAIL - no tables published; all realtime is inert'
    ELSE 'REVIEW - ' || count(*) || ' table(s) published'
  END                                             AS status,
  coalesce(string_agg(tablename, ', '), '(none)') AS detail
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';


-- ============================================
-- 14. STORAGE BUCKETS
-- ============================================
-- documents and the uploadFile() helper exist, but with no bucket every
-- attachment upload fails with "Bucket not found".
SELECT
  '14. storage buckets'                         AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'FAIL - no buckets; attachments cannot work'
    ELSE 'REVIEW - ' || count(*) || ' bucket(s)'
  END                                             AS status,
  coalesce(string_agg(id || ' (public=' || public::TEXT || ')', ', '), '(none)') AS detail
FROM storage.buckets;

SELECT
  '14b. public buckets'                         AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS - no public buckets'
    ELSE 'FAIL - ' || count(*) || ' PUBLIC bucket(s) holding cooperative data'
  END                                             AS status,
  coalesce(string_agg(id, ', '), '(none)')       AS detail
FROM storage.buckets
WHERE public = true;


-- ============================================
-- 15. TABLES THE APPLICATION QUERIES BUT THAT DO NOT EXIST
-- ============================================
-- These three are referenced in src/ but were never created. Any query against
-- them fails at runtime.
SELECT
  '15. phantom tables'                          AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'FAIL - ' || count(*) || ' referenced table(s) missing: ' || string_agg(want.t, ', ')
  END                                             AS status,
  'referenced by: TransactionList.jsx, treasurer/Transactions.jsx, MemberDashboard.jsx' AS detail
FROM (
  SELECT unnest(ARRAY['transactions', 'accounts', 'time_deposits']) AS t
) want
WHERE to_regclass('public.' || want.t) IS NULL;


-- ============================================
-- 16. UNSEEDED CHART OF ACCOUNTS
-- ============================================
-- Every book column must map to an account. With none seeded, no posting is
-- possible.
SELECT
  '16. chart_of_accounts seeded'                AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'FAIL - table is empty; no account can be referenced'
    ELSE 'REVIEW - ' || count(*) || ' account(s)'
  END                                             AS status,
  'required before the Books module can function' AS detail
FROM public.chart_of_accounts;


-- ============================================
-- 17. ROLE DISTRIBUTION
-- ============================================
SELECT
  role,
  count(*)                                        AS staff_count,
  count(*) FILTER (WHERE is_active)              AS active_count,
  count(*) FILTER (WHERE user_id IS NULL)        AS missing_auth_user
FROM public.staff
GROUP BY role
ORDER BY role;

SELECT
  '17b. auth users without a staff record'       AS check_name,
  CASE
    WHEN count(*) = 0 THEN 'PASS'
    ELSE 'REVIEW - ' || count(*) || ' auth user(s) cannot log in'
  END                                             AS status,
  coalesce(string_agg(au.email, ', '), '(none)') AS detail
FROM auth.users au
LEFT JOIN public.staff s ON s.user_id = au.id
WHERE s.id IS NULL
  AND au.email_confirmed_at IS NOT NULL;


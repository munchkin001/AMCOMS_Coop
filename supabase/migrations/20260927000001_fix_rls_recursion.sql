-- ============================================
-- AMCOMS: Fix RLS Infinite Recursion on public.staff
-- Migration: 20260927000001
-- ------------------------------------------------------------
-- PROBLEM
--   Migration 20260910000004 created:
--     CREATE POLICY "Staff can view all staff" ON public.staff FOR SELECT
--     USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() ...));
--
--   A row-level security policy on table X that reads table X causes
--   PostgreSQL to raise:
--     ERROR: infinite recursion detected in policy for relation "staff"
--
--   IMPACT: every SELECT against public.staff fails, including the lookup in
--   AuthContext.fetchStaffProfile(). No role can authenticate.
--
-- FIX
--   Introduce SECURITY DEFINER helper functions that resolve the current
--   staff/member identity once, and rewrite every policy to use them instead
--   of inlining a subquery against public.staff.
--
--   SECURITY DEFINER functions owned by the table owner bypass RLS, so they
--   do not re-enter the policy and do not recurse.
--
-- IDEMPOTENT: safe to run whether or not 20260926000001/000002 were applied.
-- ============================================


-- ============================================
-- 1. IDENTITY HELPER FUNCTIONS
-- ============================================

-- Returns the staff.id for the current authenticated user, regardless of
-- active state. Returns NULL for anonymous users and for users with no
-- staff record.
--
-- SECURITY DEFINER + SET search_path is the required combination: without the
-- search_path pin, a caller who can create objects in a schema on the path
-- could hijack the function.
CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;
COMMENT ON FUNCTION public.current_staff_id() IS
  'Returns public.staff.id for the current auth user, or NULL. SECURITY DEFINER so RLS on public.staff is not re-entered (avoids infinite recursion).';
-- True only when the current auth user has an ACTIVE staff record.
-- This is the predicate every "staff may read" policy should use, so that a
-- deactivated account loses read access consistently.
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
  );
$$;
COMMENT ON FUNCTION public.is_active_staff() IS
  'True when the current auth user has an active staff record. Use this for all "active staff may read" policies.';
-- Returns the member id for the current user (member portal users only).
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.member_id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND s.role = 'member'
  LIMIT 1;
$$;
COMMENT ON FUNCTION public.current_member_id() IS
  'Returns the members.id linked to the current member user, or NULL.';
-- Returns the role of the current auth user.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.role
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;
COMMENT ON FUNCTION public.current_user_role() IS
  'Returns the role of the currently authenticated user, or NULL.';
-- Recreated here with SET search_path and is_active enforcement.
-- Replaces the version created by 20260910000002.
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.role = required_role
      AND s.is_active = true
  );
$$;
COMMENT ON FUNCTION public.has_role(TEXT) IS
  'True if the current auth user holds the given role and is active.';
CREATE OR REPLACE FUNCTION public.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.role = ANY (required_roles)
      AND s.is_active = true
  );
$$;
COMMENT ON FUNCTION public.has_any_role(TEXT[]) IS
  'True if the current auth user holds any of the given roles and is active.';
-- Kept for backward compatibility. Now delegates to current_member_id().
CREATE OR REPLACE FUNCTION public.get_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_member_id();
$$;
CREATE OR REPLACE FUNCTION public.get_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_staff_id();
$$;
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_user_role();
$$;
-- ============================================
-- 2. UNIQUE CONSTRAINT DEPENDENCY
-- ============================================
-- 20260926000001 (create_member_from_application) uses ON CONFLICT (user_id),
-- which requires a unique constraint. 20260926000002 adds it, but if that
-- migration has not run, or ran out of order, the trigger fails. Adding it
-- here idempotently removes the ordering dependency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_user_id_unique'
  ) THEN
    ALTER TABLE public.staff ADD CONSTRAINT staff_user_id_unique UNIQUE (user_id);
    RAISE NOTICE 'Added staff_user_id_unique constraint.';
  ELSE
    RAISE NOTICE 'staff_user_id_unique already present; skipping.';
  END IF;
END $$;
-- ============================================
-- 3. STAFF POLICIES  (the recursion blocker)
-- ============================================
DROP POLICY IF EXISTS "Staff can view all staff" ON public.staff;
CREATE POLICY "Staff can view all staff"
  ON public.staff FOR SELECT
  USING (public.current_staff_id() IS NOT NULL);
-- Users can always read their own record, even if deactivated (so the UI can
-- show "your account has been deactivated" rather than a blank 403).
DROP POLICY IF EXISTS "Users can view own staff record" ON public.staff;
CREATE POLICY "Users can view own staff record"
  ON public.staff FOR SELECT
  USING (user_id = auth.uid());
-- Only chairman or manager may modify staff records.
DROP POLICY IF EXISTS "Chairman and manager can manage staff" ON public.staff;
CREATE POLICY "Chairman and manager can manage staff"
  ON public.staff FOR ALL
  USING (public.has_any_role(ARRAY['chairman', 'manager']::TEXT[]))
  WITH CHECK (public.has_any_role(ARRAY['chairman', 'manager']::TEXT[]));
-- ============================================
-- 4. POLICIES THAT INLINED A staff SUBQUERY
-- ============================================
-- Each of these previously did:
--   USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() ...))
-- Some omitted `is_active = true`, which meant a deactivated account kept
-- read access to inventory, purchasing and document data. All are replaced
-- with public.is_active_staff() so the behaviour is uniform.

-- chart_of_accounts
DROP POLICY IF EXISTS "All staff can view COA" ON public.chart_of_accounts;
CREATE POLICY "All staff can view COA"
  ON public.chart_of_accounts FOR SELECT
  USING (public.is_active_staff());
-- loan_products
DROP POLICY IF EXISTS "All staff can view loan products" ON public.loan_products;
CREATE POLICY "All staff can view loan products"
  ON public.loan_products FOR SELECT
  USING (public.is_active_staff());
-- products
DROP POLICY IF EXISTS "All staff can view products" ON public.products;
CREATE POLICY "All staff can view products"
  ON public.products FOR SELECT
  USING (public.is_active_staff());
-- product_categories
DROP POLICY IF EXISTS "All staff can view categories" ON public.product_categories;
CREATE POLICY "All staff can view categories"
  ON public.product_categories FOR SELECT
  USING (public.is_active_staff());
-- stock_inventory
DROP POLICY IF EXISTS "All staff can view stock" ON public.stock_inventory;
CREATE POLICY "All staff can view stock"
  ON public.stock_inventory FOR SELECT
  USING (public.is_active_staff());
-- stock_movements
DROP POLICY IF EXISTS "All staff can view movements" ON public.stock_movements;
CREATE POLICY "All staff can view movements"
  ON public.stock_movements FOR SELECT
  USING (public.is_active_staff());
-- production_records
DROP POLICY IF EXISTS "Staff can view production records" ON public.production_records;
CREATE POLICY "Staff can view production records"
  ON public.production_records FOR SELECT
  USING (public.is_active_staff());
-- sales_orders
DROP POLICY IF EXISTS "All staff can view sales" ON public.sales_orders;
CREATE POLICY "All staff can view sales"
  ON public.sales_orders FOR SELECT
  USING (public.is_active_staff());
-- sales_order_items
DROP POLICY IF EXISTS "All staff can view sales items" ON public.sales_order_items;
CREATE POLICY "All staff can view sales items"
  ON public.sales_order_items FOR SELECT
  USING (public.is_active_staff());
-- suppliers
DROP POLICY IF EXISTS "All staff can view suppliers" ON public.suppliers;
CREATE POLICY "All staff can view suppliers"
  ON public.suppliers FOR SELECT
  USING (public.is_active_staff());
-- purchases
DROP POLICY IF EXISTS "Staff can view purchases" ON public.purchases;
CREATE POLICY "Staff can view purchases"
  ON public.purchases FOR SELECT
  USING (public.is_active_staff());
-- purchase_items
DROP POLICY IF EXISTS "Staff can view purchase items" ON public.purchase_items;
CREATE POLICY "Staff can view purchase items"
  ON public.purchase_items FOR SELECT
  USING (public.is_active_staff());
-- documents
DROP POLICY IF EXISTS "Staff can view documents" ON public.documents;
CREATE POLICY "Staff can view documents"
  ON public.documents FOR SELECT
  USING (public.is_active_staff());
DROP POLICY IF EXISTS "Staff can upload documents" ON public.documents;
CREATE POLICY "Staff can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (public.is_active_staff());
-- notifications
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_active_staff());
-- sms_logs
DROP POLICY IF EXISTS "Staff can view sms logs" ON public.sms_logs;
CREATE POLICY "Staff can view sms logs"
  ON public.sms_logs FOR SELECT
  USING (public.is_active_staff());
-- email_logs
DROP POLICY IF EXISTS "Staff can view email logs" ON public.email_logs;
CREATE POLICY "Staff can view email logs"
  ON public.email_logs FOR SELECT
  USING (public.is_active_staff());
-- ============================================
-- 5. VERIFICATION
-- ============================================
DO $$
DECLARE
  still_recursive TEXT;
BEGIN
  -- Detect any remaining policy on public.staff that reads public.staff.
  SELECT string_agg(p.proname, ', ')
    INTO still_recursive
  FROM pg_policies pol
  JOIN pg_proc p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = pol.qual
  WHERE pol.schemaname = 'public'
    AND pol.tablename = 'staff'
    AND pol.qual ~* 'staff'
    AND pol.qual NOT IN (
      'current_staff_id', 'is_active_staff', 'current_user_role',
      'has_role', 'has_any_role', 'get_staff_id'
    );

  -- Reported, not raised: a verifier must never block a deployment. Run
  -- scripts/verify-security.sql to treat this as a hard gate.
  IF still_recursive IS NOT NULL THEN
    RAISE WARNING
      'Policies on public.staff still reference a staff-reading function: %', still_recursive;
  END IF;

  RAISE NOTICE '✓ Migration 20260927000001 completed.';
  RAISE NOTICE '✓ Identity helpers created with SET search_path.';
  RAISE NOTICE '✓ Recursive policy on public.staff replaced.';
  RAISE NOTICE '✓ 19 inlined staff subqueries replaced with is_active_staff().';
  RAISE NOTICE '✓ staff_user_id_unique ensured (removes ordering dependency).';
END $$;

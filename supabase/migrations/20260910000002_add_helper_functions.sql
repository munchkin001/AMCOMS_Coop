-- ============================================
-- AMCOMS: Add Helper Functions
-- Migration: 20260910000002
-- Description: Database helper functions for reference numbers,
--              role validation, balance calculations, etc.
-- ============================================

-- ============================================
-- 1. REFERENCE NUMBER GENERATION
-- ============================================

-- Generate unique reference number with prefix and year
CREATE OR REPLACE FUNCTION public.generate_reference_number(
  prefix TEXT,
  table_name TEXT,
  column_name TEXT DEFAULT 'created_at'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  year TEXT;
  next_seq INTEGER;
  ref_number TEXT;
BEGIN
  year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get the count of records created this year + 1
  EXECUTE format('
    SELECT COALESCE(MAX(
      CAST(
        SUBSTRING(
          SPLIT_PART(%I, ''-'', 3)
          FROM 1
        ) AS INTEGER
      )
    ), 0) + 1
    FROM %I
    WHERE EXTRACT(YEAR FROM %I) = $1
  ', column_name, table_name, column_name)
  INTO next_seq
  USING EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Format: PREFIX-YYYY-000001
  ref_number := prefix || '-' || year || '-' || LPAD(next_seq::TEXT, 6, '0');
  
  RETURN ref_number;
END;
$$;

COMMENT ON FUNCTION public.generate_reference_number IS 'Generates unique reference numbers in format: PREFIX-YYYY-000001';

-- ============================================
-- 2. USER ROLE FUNCTIONS
-- ============================================

-- Get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.staff
  WHERE user_id = auth.uid();
  
  RETURN user_role;
END;
$$;

COMMENT ON FUNCTION public.get_user_role IS 'Returns the role of the currently authenticated user';

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.staff
    WHERE user_id = auth.uid()
    AND role = required_role
    AND is_active = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_role IS 'Checks if current user has a specific role';

-- Check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.staff
    WHERE user_id = auth.uid()
    AND role = ANY(required_roles)
    AND is_active = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_any_role IS 'Checks if current user has any of the specified roles';

-- Get current user's staff ID
CREATE OR REPLACE FUNCTION public.get_staff_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  staff_id UUID;
BEGIN
  SELECT id INTO staff_id
  FROM public.staff
  WHERE user_id = auth.uid();
  
  RETURN staff_id;
END;
$$;

COMMENT ON FUNCTION public.get_staff_id IS 'Returns the staff ID of the currently authenticated user';

-- Get current user's member ID (for member portal users)
CREATE OR REPLACE FUNCTION public.get_member_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  member_id UUID;
BEGIN
  SELECT member_id INTO member_id
  FROM public.staff
  WHERE user_id = auth.uid();
  
  RETURN member_id;
END;
$$;

COMMENT ON FUNCTION public.get_member_id IS 'Returns the member ID of the currently authenticated user (for member portal)';

-- Check if user is a member (not staff)
CREATE OR REPLACE FUNCTION public.is_member_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.staff
    WHERE user_id = auth.uid()
    AND role = 'member'
    AND member_id IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.is_member_user IS 'Checks if current user is a member (has member_id)';

-- ============================================
-- 3. FINANCIAL CALCULATIONS
-- ============================================

-- Calculate member's total savings balance
CREATE OR REPLACE FUNCTION public.get_member_total_savings(p_member_id UUID)
RETURNS DECIMAL(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  total_balance DECIMAL(15, 2);
BEGIN
  SELECT COALESCE(SUM(balance), 0)
  INTO total_balance
  FROM public.savings_accounts
  WHERE member_id = p_member_id
  AND account_type = 'regular'
  AND status = 'active';
  
  RETURN total_balance;
END;
$$;

COMMENT ON FUNCTION public.get_member_total_savings IS 'Calculates total regular savings balance for a member';

-- Calculate member's total time deposit balance
CREATE OR REPLACE FUNCTION public.get_member_total_time_deposit(p_member_id UUID)
RETURNS DECIMAL(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  total_balance DECIMAL(15, 2);
BEGIN
  SELECT COALESCE(SUM(balance), 0)
  INTO total_balance
  FROM public.savings_accounts
  WHERE member_id = p_member_id
  AND account_type = 'time_deposit'
  AND status = 'active';
  
  RETURN total_balance;
END;
$$;

COMMENT ON FUNCTION public.get_member_total_time_deposit IS 'Calculates total time deposit balance for a member';

-- Calculate member's total loan balance
CREATE OR REPLACE FUNCTION public.get_member_total_loan_balance(p_member_id UUID)
RETURNS DECIMAL(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  total_balance DECIMAL(15, 2);
BEGIN
  SELECT COALESCE(SUM(balance), 0)
  INTO total_balance
  FROM public.loans
  WHERE member_id = p_member_id
  AND status IN ('active', 'approved');
  
  RETURN total_balance;
END;
$$;

COMMENT ON FUNCTION public.get_member_total_loan_balance IS 'Calculates total outstanding loan balance for a member';

-- Calculate next loan payment amount and date
CREATE OR REPLACE FUNCTION public.get_next_loan_payment(p_member_id UUID)
RETURNS TABLE (
  amount DECIMAL(15, 2),
  due_date DATE,
  loan_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.monthly_payment,
    CURRENT_DATE + INTERVAL '1 month' AS due_date,
    l.id
  FROM public.loans l
  WHERE l.member_id = p_member_id
  AND l.status = 'active'
  AND l.balance > 0
  ORDER BY l.release_date ASC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_next_loan_payment IS 'Returns the next loan payment amount and due date for a member';

-- ============================================
-- 4. VALIDATION FUNCTIONS
-- ============================================

-- Validate sufficient savings balance for withdrawal
CREATE OR REPLACE FUNCTION public.validate_withdrawal_balance(
  p_account_id UUID,
  p_amount DECIMAL(15, 2)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  current_balance DECIMAL(15, 2);
BEGIN
  SELECT balance INTO current_balance
  FROM public.savings_accounts
  WHERE id = p_account_id;
  
  RETURN (current_balance >= p_amount);
END;
$$;

COMMENT ON FUNCTION public.validate_withdrawal_balance IS 'Validates if savings account has sufficient balance for withdrawal';

-- Check if member has active loans
CREATE OR REPLACE FUNCTION public.member_has_active_loans(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.loans
    WHERE member_id = p_member_id
    AND status IN ('active', 'approved')
    AND balance > 0
  );
END;
$$;

COMMENT ON FUNCTION public.member_has_active_loans IS 'Checks if member has any active loans with outstanding balance';

-- Check if product is low stock
CREATE OR REPLACE FUNCTION public.is_low_stock(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  current_qty INTEGER;
  reorder_level INTEGER;
BEGIN
  SELECT 
    si.quantity_available,
    p.reorder_level
  INTO current_qty, reorder_level
  FROM public.stock_inventory si
  JOIN public.products p ON p.id = si.product_id
  WHERE si.product_id = p_product_id;
  
  RETURN (current_qty <= reorder_level);
END;
$$;

COMMENT ON FUNCTION public.is_low_stock IS 'Checks if product stock is at or below reorder level';

-- ============================================
-- 5. BUSINESS LOGIC FUNCTIONS
-- ============================================

-- Create notification for user
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_table TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    notification_type,
    title,
    message,
    related_table,
    related_id,
    priority
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_related_table,
    p_related_id,
    p_priority
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

COMMENT ON FUNCTION public.create_notification IS 'Creates a new notification for a user';

-- Mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.notifications
  SET 
    is_read = true,
    read_at = timezone('utc'::text, now())
  WHERE id = p_notification_id
  AND user_id = public.get_staff_id();
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.mark_notification_read IS 'Marks a notification as read by the current user';

-- Get unread notification count for current user
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unread_count
  FROM public.notifications
  WHERE user_id = public.get_staff_id()
  AND is_read = false;
  
  RETURN unread_count;
END;
$$;

COMMENT ON FUNCTION public.get_unread_notification_count IS 'Returns count of unread notifications for current user';

-- ============================================
-- 6. REPORTING FUNCTIONS
-- ============================================

-- Get daily cash position
CREATE OR REPLACE FUNCTION public.get_daily_cash_position(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  cash_receipts DECIMAL(15, 2),
  cash_disbursements DECIMAL(15, 2),
  net_cash_flow DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cr.amount), 0) AS cash_receipts,
    COALESCE(SUM(cd.amount), 0) AS cash_disbursements,
    COALESCE(SUM(cr.amount), 0) - COALESCE(SUM(cd.amount), 0) AS net_cash_flow
  FROM (
    SELECT amount FROM public.cash_receipts WHERE receipt_date = p_date
  ) cr
  FULL OUTER JOIN (
    SELECT amount FROM public.cash_disbursements WHERE disbursement_date = p_date
  ) cd ON true;
END;
$$;

COMMENT ON FUNCTION public.get_daily_cash_position IS 'Returns daily cash receipts, disbursements, and net flow';

-- Get account balance (from ledger)
CREATE OR REPLACE FUNCTION public.get_account_balance(
  p_account_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  account_balance DECIMAL(15, 2);
  account_type TEXT;
BEGIN
  -- Get account type
  SELECT a.account_type INTO account_type
  FROM public.chart_of_accounts a
  WHERE a.id = p_account_id;
  
  -- Calculate balance based on account type
  -- Assets and Expenses: Debit increases, Credit decreases
  -- Liabilities, Equity, Revenue: Credit increases, Debit decreases
  
  IF account_type IN ('asset', 'expense') THEN
    SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO account_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
    AND je.entry_date <= p_as_of_date
    AND je.status = 'posted';
  ELSE
    SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
    INTO account_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
    AND je.entry_date <= p_as_of_date
    AND je.status = 'posted';
  END IF;
  
  RETURN account_balance;
END;
$$;

COMMENT ON FUNCTION public.get_account_balance IS 'Calculates account balance from journal entries as of a specific date';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 20260910000002 completed successfully!';
  RAISE NOTICE '✓ Added helper functions:';
  RAISE NOTICE '  - generate_reference_number() - Generate unique reference numbers';
  RAISE NOTICE '  - get_user_role() - Get current user role';
  RAISE NOTICE '  - has_role() - Check user role';
  RAISE NOTICE '  - has_any_role() - Check multiple roles';
  RAISE NOTICE '  - get_staff_id() - Get staff ID';
  RAISE NOTICE '  - get_member_id() - Get member ID';
  RAISE NOTICE '  - Financial calculation functions';
  RAISE NOTICE '  - Validation functions';
  RAISE NOTICE '  - Notification functions';
  RAISE NOTICE '  - Reporting functions';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Run migration 20260910000003 for audit triggers';
END $$;

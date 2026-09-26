-- ============================================
-- CLEANUP DATABASE - REMOVE ALL DUMMY DATA
-- ============================================
-- Run this in Supabase SQL Editor to clean up the database
-- This will remove all existing data but keep the table structures

-- ============================================
-- STEP 1: Delete all data from tables
-- ============================================

-- Financial/Bookkeeping
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;
DELETE FROM cash_disbursements;
DELETE FROM cash_receipts;

-- Loans
DELETE FROM loan_payments;
DELETE FROM loans;

-- Savings
DELETE FROM savings_transactions;
DELETE FROM time_deposits;
DELETE FROM savings_accounts;

-- Inventory
DELETE FROM stock_movements;
DELETE FROM production_records;
DELETE FROM stock_inventory;
DELETE FROM products;
DELETE FROM product_categories;

-- Members (Keep this last as other tables reference it)
DELETE FROM share_capital;
DELETE FROM members;

-- Staff (Keep staff records for login access)
-- DELETE FROM staff;  -- Uncomment only if you want to remove all staff too

-- ============================================
-- STEP 2: Create audit_logs table
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(staff_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL, -- 'Loans', 'Financial', 'Inventory', 'Savings', 'Members'
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id ON public.audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;

-- Create RLS policy (staff can view all logs)
CREATE POLICY "Staff can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.staff WHERE is_active = true));

-- ============================================
-- STEP 3: Reset sequences (auto-increment)
-- ============================================

-- This resets all ID sequences back to 1
-- Only needed if you want IDs to start from 1 again

-- Note: Replace table_name_id_seq with actual sequence names if different
-- ALTER SEQUENCE members_member_id_seq RESTART WITH 1;
-- ALTER SEQUENCE loans_loan_id_seq RESTART WITH 1;
-- ALTER SEQUENCE savings_accounts_account_id_seq RESTART WITH 1;
-- etc.

-- ============================================
-- STEP 4: Verify cleanup
-- ============================================

-- Check row counts (should all be 0 except staff)
SELECT 
  'members' as table_name, COUNT(*) as row_count FROM members
UNION ALL
SELECT 'loans', COUNT(*) FROM loans
UNION ALL
SELECT 'savings_accounts', COUNT(*) FROM savings_accounts
UNION ALL
SELECT 'time_deposits', COUNT(*) FROM time_deposits
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'cash_receipts', COUNT(*) FROM cash_receipts
UNION ALL
SELECT 'cash_disbursements', COUNT(*) FROM cash_disbursements
UNION ALL
SELECT 'journal_entries', COUNT(*) FROM journal_entries
UNION ALL
SELECT 'staff', COUNT(*) FROM staff
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs
ORDER BY table_name;

-- ============================================
-- STEP 5: Create audit log helper function
-- ============================================

-- This function can be called to create audit log entries
CREATE OR REPLACE FUNCTION log_audit(
  p_staff_id UUID,
  p_action TEXT,
  p_module TEXT,
  p_details TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (p_staff_id, p_action, p_module, p_details)
  RETURNING audit_log_id INTO new_audit_id;
  
  RETURN new_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage:
-- SELECT log_audit(
--   'staff-uuid-here',
--   'Created new member',
--   'Members',
--   'Member ID: M-2024-001, Name: Juan Dela Cruz'
-- );

-- ============================================
-- STEP 6: Create trigger for automatic logging
-- ============================================

-- Trigger function to log member creation
CREATE OR REPLACE FUNCTION log_member_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (
    auth.uid(),
    'Created new member',
    'Members',
    'Member Number: ' || NEW.member_number || ', Name: ' || NEW.first_name || ' ' || NEW.last_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to members table
DROP TRIGGER IF EXISTS trigger_log_member_creation ON public.members;
CREATE TRIGGER trigger_log_member_creation
  AFTER INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION log_member_creation();

-- ============================================
-- STEP 7: Similar triggers for other tables
-- ============================================

-- Loan creation
CREATE OR REPLACE FUNCTION log_loan_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (
    auth.uid(),
    'Created new loan',
    'Loans',
    'Loan Number: ' || NEW.loan_number || ', Amount: ₱' || NEW.loan_amount
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_loan_creation ON public.loans;
CREATE TRIGGER trigger_log_loan_creation
  AFTER INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION log_loan_creation();

-- Cash receipt
CREATE OR REPLACE FUNCTION log_cash_receipt()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (
    auth.uid(),
    'Recorded cash receipt',
    'Financial',
    'Receipt No: ' || NEW.receipt_number || ', Amount: ₱' || NEW.amount
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_cash_receipt ON public.cash_receipts;
CREATE TRIGGER trigger_log_cash_receipt
  AFTER INSERT ON public.cash_receipts
  FOR EACH ROW
  EXECUTE FUNCTION log_cash_receipt();

-- Cash disbursement
CREATE OR REPLACE FUNCTION log_cash_disbursement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (
    auth.uid(),
    'Recorded cash disbursement',
    'Financial',
    'Voucher No: ' || NEW.voucher_number || ', Amount: ₱' || NEW.amount || ', Payee: ' || NEW.payee
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_cash_disbursement ON public.cash_disbursements;
CREATE TRIGGER trigger_log_cash_disbursement
  AFTER INSERT ON public.cash_disbursements
  FOR EACH ROW
  EXECUTE FUNCTION log_cash_disbursement();

-- Product creation
CREATE OR REPLACE FUNCTION log_product_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (staff_id, action, module, details)
  VALUES (
    auth.uid(),
    'Added new product',
    'Inventory',
    'Product: ' || NEW.product_name || ', Code: ' || NEW.product_code
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_product_creation ON public.products;
CREATE TRIGGER trigger_log_product_creation
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION log_product_creation();

-- ============================================
-- SUMMARY
-- ============================================
-- This script:
-- 1. Deletes all dummy data from tables
-- 2. Creates audit_logs table for tracking user actions
-- 3. Creates helper function for manual audit logging
-- 4. Creates automatic triggers for common actions
-- 5. Preserves staff records for login access
--
-- Now when users perform actions, they will automatically
-- appear in the audit log!
-- ============================================


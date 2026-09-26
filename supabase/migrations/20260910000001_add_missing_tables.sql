-- ============================================
-- AMCOMS: Add Missing Critical Tables
-- Migration: 20260910000001
-- Description: Adds line item tables, documents, notifications, 
--              requests, logs, settings, and suppliers
-- ============================================

-- ============================================
-- 1. CASH RECEIPT/DISBURSEMENT LINE ITEMS
-- ============================================

-- Cash Receipt Lines (for multi-account receipts)
CREATE TABLE IF NOT EXISTS public.cash_receipt_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_receipt_id UUID NOT NULL REFERENCES public.cash_receipts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS cash_receipt_lines_receipt_idx ON public.cash_receipt_lines(cash_receipt_id);
CREATE INDEX IF NOT EXISTS cash_receipt_lines_account_idx ON public.cash_receipt_lines(account_id);

-- Cash Disbursement Lines (for multi-account disbursements)
CREATE TABLE IF NOT EXISTS public.cash_disbursement_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_disbursement_id UUID NOT NULL REFERENCES public.cash_disbursements(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS cash_disbursement_lines_disbursement_idx ON public.cash_disbursement_lines(cash_disbursement_id);
CREATE INDEX IF NOT EXISTS cash_disbursement_lines_account_idx ON public.cash_disbursement_lines(account_id);

-- ============================================
-- 2. DOCUMENT MANAGEMENT
-- ============================================

-- Documents (Supabase Storage metadata)
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  related_table TEXT NOT NULL,
  related_id UUID NOT NULL,
  document_type TEXT CHECK (document_type IN ('receipt', 'invoice', 'voucher', 'contract', 'report', 'other')),
  uploaded_by UUID REFERENCES public.staff(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS documents_related_idx ON public.documents(related_table, related_id);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON public.documents(uploaded_by);
CREATE INDEX IF NOT EXISTS documents_uploaded_at_idx ON public.documents(uploaded_at);

-- ============================================
-- 3. NOTIFICATIONS SYSTEM
-- ============================================

-- In-app notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('info', 'success', 'warning', 'error', 'approval')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_table TEXT,
  related_id UUID,
  action_url TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications(created_at);

-- Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_roles TEXT[], -- Array of roles who should see this
  is_active BOOLEAN DEFAULT true,
  published_by UUID REFERENCES public.staff(id),
  published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS announcements_is_active_idx ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS announcements_published_at_idx ON public.announcements(published_at);

-- ============================================
-- 4. REQUESTS & APPROVALS
-- ============================================

-- Generic requests table (loan applications, withdrawal requests, etc.)
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('loan_application', 'withdrawal', 'loan_release', 'membership', 'other')),
  member_id UUID REFERENCES public.members(id),
  requester_id UUID REFERENCES public.staff(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),
  request_data JSONB NOT NULL,
  amount DECIMAL(15, 2), -- For financial requests
  reviewed_by UUID REFERENCES public.staff(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  approved_by UUID REFERENCES public.staff(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS requests_member_idx ON public.requests(member_id);
CREATE INDEX IF NOT EXISTS requests_status_idx ON public.requests(status);
CREATE INDEX IF NOT EXISTS requests_type_idx ON public.requests(request_type);
CREATE INDEX IF NOT EXISTS requests_created_idx ON public.requests(created_at);

-- ============================================
-- 5. COMMUNICATION LOGS
-- ============================================

-- SMS Logs (Semaphore integration)
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_name TEXT,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  provider TEXT DEFAULT 'semaphore',
  provider_response JSONB,
  related_table TEXT,
  related_id UUID,
  cost DECIMAL(10, 4), -- SMS cost
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON public.sms_logs(status);
CREATE INDEX IF NOT EXISTS sms_logs_sent_idx ON public.sms_logs(sent_at);
CREATE INDEX IF NOT EXISTS sms_logs_phone_idx ON public.sms_logs(phone_number);

-- Email Logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_name TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced')),
  provider TEXT,
  provider_response JSONB,
  related_table TEXT,
  related_id UUID,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS email_logs_status_idx ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS email_logs_sent_idx ON public.email_logs(sent_at);
CREATE INDEX IF NOT EXISTS email_logs_recipient_idx ON public.email_logs(recipient_email);

-- ============================================
-- 6. SYSTEM CONFIGURATION
-- ============================================

-- System Settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type TEXT DEFAULT 'text' CHECK (setting_type IN ('text', 'number', 'boolean', 'json')),
  category TEXT DEFAULT 'general',
  description TEXT,
  is_public BOOLEAN DEFAULT false, -- Can non-admin users see this?
  updated_by UUID REFERENCES public.staff(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS system_settings_key_idx ON public.system_settings(setting_key);
CREATE INDEX IF NOT EXISTS system_settings_category_idx ON public.system_settings(category);

-- ============================================
-- 7. SUPPLIER MANAGEMENT
-- ============================================

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_code TEXT UNIQUE NOT NULL,
  supplier_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tin TEXT,
  payment_terms TEXT,
  credit_limit DECIMAL(15, 2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS suppliers_code_idx ON public.suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS suppliers_status_idx ON public.suppliers(status);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers(supplier_name);

-- Purchases (Purchase Orders)
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_number TEXT UNIQUE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(15, 2) DEFAULT 0.00,
  tax_amount DECIMAL(15, 2) DEFAULT 0.00,
  net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.staff(id),
  approved_by UUID REFERENCES public.staff(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS purchases_supplier_idx ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON public.purchases(purchase_date);
CREATE INDEX IF NOT EXISTS purchases_status_idx ON public.purchases(status);

-- Purchase Items
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(15, 2) NOT NULL CHECK (unit_cost >= 0),
  discount_amount DECIMAL(15, 2) DEFAULT 0.00,
  line_total DECIMAL(15, 2) NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS purchase_items_product_idx ON public.purchase_items(product_id);

-- ============================================
-- 8. ADD MEMBER LINK TO STAFF TABLE
-- ============================================

-- Add member_id to staff table for member portal users
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id);

CREATE INDEX IF NOT EXISTS staff_member_id_idx ON public.staff(member_id);

-- ============================================
-- 9. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================

ALTER TABLE public.cash_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_disbursement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. TEMPORARY BASIC POLICIES (Will be replaced in next migration)
-- ============================================

-- Note: These are basic policies that allow authenticated access
-- They will be replaced with proper role-based policies in the next migration

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cash_receipt_lines',
    'cash_disbursement_lines',
    'documents',
    'notifications',
    'announcements',
    'requests',
    'sms_logs',
    'email_logs',
    'system_settings',
    'suppliers',
    'purchases',
    'purchase_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "Authenticated users can view %I" ON public.%I;
      CREATE POLICY "Authenticated users can view %I"
        ON public.%I
        FOR SELECT
        USING (auth.role() = ''authenticated'');
    ', t, t, t, t);
    
    EXECUTE format('
      DROP POLICY IF EXISTS "Authenticated users can manage %I" ON public.%I;
      CREATE POLICY "Authenticated users can manage %I"
        ON public.%I
        FOR ALL
        USING (auth.role() = ''authenticated'');
    ', t, t, t, t);
  END LOOP;
END $$;

-- ============================================
-- 11. UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================

-- Apply updated_at trigger to tables with updated_at column
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'announcements',
    'requests',
    'system_settings',
    'suppliers',
    'purchases'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    ', t, t);
  END LOOP;
END $$;

-- ============================================
-- 12. INSERT DEFAULT SYSTEM SETTINGS
-- ============================================

INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
  ('cooperative_name', 'Agay-ayan Multi-Purpose Cooperative', 'text', 'general', 'Full name of the cooperative', true),
  ('cooperative_short_name', 'AMPC', 'text', 'general', 'Short name/acronym', true),
  ('cooperative_tin', '', 'text', 'general', 'Tax Identification Number', false),
  ('cooperative_address', 'Agay-ayan, Philippines', 'text', 'general', 'Primary address', true),
  ('cooperative_phone', '+63 XXX XXX XXXX', 'text', 'general', 'Contact phone number', true),
  ('cooperative_email', 'info@agayayanmpc.coop', 'text', 'general', 'Contact email address', true),
  ('currency', 'PHP', 'text', 'general', 'Currency code', true),
  ('currency_symbol', '₱', 'text', 'general', 'Currency symbol', true),
  ('date_format', 'MM/DD/YYYY', 'text', 'general', 'Date display format', false),
  ('fiscal_year_start', '01', 'text', 'accounting', 'Fiscal year start month (01-12)', false),
  ('enable_sms_notifications', 'false', 'boolean', 'notifications', 'Enable SMS notifications via Semaphore', false),
  ('enable_email_notifications', 'true', 'boolean', 'notifications', 'Enable email notifications', false),
  ('loan_approval_amount_limit', '50000', 'number', 'loans', 'Amount requiring chairman approval', false),
  ('withdrawal_approval_amount_limit', '10000', 'number', 'savings', 'Amount requiring treasurer approval', false),
  ('low_stock_alert_threshold', '10', 'number', 'inventory', 'Trigger low stock alert at this quantity', false)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 20260910000001 completed successfully!';
  RAISE NOTICE '✓ Added 12 new tables: cash_receipt_lines, cash_disbursement_lines, documents, notifications, announcements, requests, sms_logs, email_logs, system_settings, suppliers, purchases, purchase_items';
  RAISE NOTICE '✓ Added member_id column to staff table';
  RAISE NOTICE '✓ Enabled RLS on all new tables';
  RAISE NOTICE '✓ Applied updated_at triggers';
  RAISE NOTICE '✓ Inserted default system settings';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run migration 20260910000002 to implement proper RLS policies';
  RAISE NOTICE '2. Run migration 20260910000003 to add audit triggers';
  RAISE NOTICE '3. Run migration 20260910000004 to add helper functions';
END $$;

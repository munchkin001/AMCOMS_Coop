-- ============================================
-- AMCOMS Complete Database Schema
-- Agay-ayan Multi-Purpose Cooperative Management System
-- ============================================

-- ============================================
-- 1. MEMBERS MODULE
-- ============================================

-- Members table (cooperative members)
CREATE TABLE IF NOT EXISTS public.members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  membership_type TEXT NOT NULL CHECK (membership_type IN ('regular', 'associate', 'honorary')),
  membership_status TEXT DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'suspended')),
  date_joined DATE DEFAULT CURRENT_DATE,
  shares_owned INTEGER DEFAULT 0,
  total_capital DECIMAL(15, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS members_member_number_idx ON public.members(member_number);
CREATE INDEX IF NOT EXISTS members_status_idx ON public.members(membership_status);
CREATE INDEX IF NOT EXISTS members_email_idx ON public.members(email);

-- ============================================
-- 2. FINANCIAL/BOOKKEEPING MODULE
-- ============================================

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_code TEXT UNIQUE NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_category TEXT,
  parent_account_id UUID REFERENCES public.chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS coa_account_code_idx ON public.chart_of_accounts(account_code);
CREATE INDEX IF NOT EXISTS coa_account_type_idx ON public.chart_of_accounts(account_type);

-- General Journal Entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_number TEXT UNIQUE NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference_number TEXT,
  entry_type TEXT DEFAULT 'general' CHECK (entry_type IN ('general', 'adjusting', 'closing', 'reversing')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  created_by UUID REFERENCES public.staff(id),
  posted_by UUID REFERENCES public.staff(id),
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS journal_entries_entry_date_idx ON public.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS journal_entries_status_idx ON public.journal_entries(status);

-- Journal Entry Lines (debits and credits)
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  debit_amount DECIMAL(15, 2) DEFAULT 0.00,
  credit_amount DECIMAL(15, 2) DEFAULT 0.00,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS journal_lines_entry_id_idx ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_id_idx ON public.journal_entry_lines(account_id);

-- Cash Receipts Book
CREATE TABLE IF NOT EXISTS public.cash_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_from TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id),
  amount DECIMAL(15, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other')),
  reference_number TEXT,
  account_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS cash_receipts_date_idx ON public.cash_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS cash_receipts_member_idx ON public.cash_receipts(member_id);

-- Cash Disbursements Book
CREATE TABLE IF NOT EXISTS public.cash_disbursements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_number TEXT UNIQUE NOT NULL,
  disbursement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payee TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other')),
  check_number TEXT,
  reference_number TEXT,
  account_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  approved_by UUID REFERENCES public.staff(id),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS cash_disbursements_date_idx ON public.cash_disbursements(disbursement_date);

-- ============================================
-- 3. INVENTORY MODULE
-- ============================================

-- Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_code TEXT UNIQUE NOT NULL,
  category_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.product_categories(id),
  unit_of_measure TEXT NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(15, 2) DEFAULT 0.00,
  reorder_level INTEGER DEFAULT 0,
  minimum_stock INTEGER DEFAULT 0,
  maximum_stock INTEGER,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS products_code_idx ON public.products(product_code);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category_id);

-- Stock Inventory
CREATE TABLE IF NOT EXISTS public.stock_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_restock_date DATE,
  last_count_date DATE,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_inventory_product_idx ON public.stock_inventory(product_id);

-- Stock Movements (History)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'production', 'waste')),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(15, 2),
  reference_number TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON public.stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS stock_movements_type_idx ON public.stock_movements(movement_type);

-- Production Records
CREATE TABLE IF NOT EXISTS public.production_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  production_number TEXT UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_produced INTEGER NOT NULL,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  production_cost DECIMAL(15, 2),
  batch_number TEXT,
  expiry_date DATE,
  status TEXT DEFAULT 'completed' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS production_records_product_idx ON public.production_records(product_id);
CREATE INDEX IF NOT EXISTS production_records_date_idx ON public.production_records(production_date);

-- ============================================
-- 4. SALES & ORDERS MODULE
-- ============================================

-- Sales Orders
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  member_id UUID REFERENCES public.members(id),
  customer_name TEXT,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(15, 2) DEFAULT 0.00,
  tax_amount DECIMAL(15, 2) DEFAULT 0.00,
  net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'cancelled')),
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'processing', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS sales_orders_date_idx ON public.sales_orders(order_date);
CREATE INDEX IF NOT EXISTS sales_orders_member_idx ON public.sales_orders(member_id);
CREATE INDEX IF NOT EXISTS sales_orders_status_idx ON public.sales_orders(order_status);

-- Sales Order Items
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  discount_amount DECIMAL(15, 2) DEFAULT 0.00,
  line_total DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS sales_order_items_order_idx ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS sales_order_items_product_idx ON public.sales_order_items(product_id);

-- ============================================
-- 5. LOANS MODULE
-- ============================================

-- Loan Products
CREATE TABLE IF NOT EXISTS public.loan_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  interest_rate DECIMAL(5, 2) NOT NULL,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('fixed', 'declining', 'add_on')),
  minimum_amount DECIMAL(15, 2),
  maximum_amount DECIMAL(15, 2),
  minimum_term_months INTEGER,
  maximum_term_months INTEGER,
  penalty_rate DECIMAL(5, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Member Loans
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_number TEXT UNIQUE NOT NULL,
  member_id UUID NOT NULL REFERENCES public.members(id),
  loan_product_id UUID REFERENCES public.loan_products(id),
  principal_amount DECIMAL(15, 2) NOT NULL,
  interest_rate DECIMAL(5, 2) NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment DECIMAL(15, 2) NOT NULL,
  total_interest DECIMAL(15, 2) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  balance DECIMAL(15, 2) NOT NULL,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approval_date DATE,
  release_date DATE,
  maturity_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'completed', 'rejected', 'written_off')),
  approved_by UUID REFERENCES public.staff(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS loans_member_idx ON public.loans(member_id);
CREATE INDEX IF NOT EXISTS loans_status_idx ON public.loans(status);

-- Loan Payments
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id),
  payment_number INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  amount_paid DECIMAL(15, 2) NOT NULL,
  principal_paid DECIMAL(15, 2) NOT NULL,
  interest_paid DECIMAL(15, 2) NOT NULL,
  penalty_paid DECIMAL(15, 2) DEFAULT 0.00,
  balance_after DECIMAL(15, 2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other')),
  reference_number TEXT,
  receipt_id UUID REFERENCES public.cash_receipts(id),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS loan_payments_loan_idx ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS loan_payments_date_idx ON public.loan_payments(payment_date);

-- ============================================
-- 6. SAVINGS MODULE
-- ============================================

-- Savings Accounts
CREATE TABLE IF NOT EXISTS public.savings_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_number TEXT UNIQUE NOT NULL,
  member_id UUID NOT NULL REFERENCES public.members(id),
  account_type TEXT NOT NULL CHECK (account_type IN ('regular', 'time_deposit', 'special')),
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  interest_rate DECIMAL(5, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dormant', 'closed')),
  opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
  closing_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS savings_accounts_member_idx ON public.savings_accounts(member_id);
CREATE INDEX IF NOT EXISTS savings_accounts_status_idx ON public.savings_accounts(status);

-- Savings Transactions
CREATE TABLE IF NOT EXISTS public.savings_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  savings_account_id UUID NOT NULL REFERENCES public.savings_accounts(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'interest', 'fee', 'transfer')),
  amount DECIMAL(15, 2) NOT NULL,
  balance_after DECIMAL(15, 2) NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  reference_number TEXT,
  receipt_id UUID REFERENCES public.cash_receipts(id),
  disbursement_id UUID REFERENCES public.cash_disbursements(id),
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS savings_transactions_account_idx ON public.savings_transactions(savings_account_id);
CREATE INDEX IF NOT EXISTS savings_transactions_date_idx ON public.savings_transactions(transaction_date);

-- ============================================
-- 7. AUDIT LOG MODULE
-- ============================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.staff(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_table_idx ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'updated_at' 
    AND table_schema = 'public'
    AND table_name != 'staff'  -- Already has trigger
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
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (Basic - authenticated users can access)
-- ============================================

-- Policy: Authenticated users can read all records
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('staff')
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

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'AMCOMS database schema created successfully!';
  RAISE NOTICE 'Tables created: members, chart_of_accounts, journal_entries, cash_receipts, cash_disbursements, products, stock_inventory, sales_orders, loans, savings_accounts, and more!';
END $$;

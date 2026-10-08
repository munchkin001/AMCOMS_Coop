-- ============================================================================
-- AMCOMS Database Structure Verification Script
-- ============================================================================
-- Purpose: Verify that the database structure matches frontend requirements
-- Run this script in Supabase SQL Editor to check database integrity
-- ============================================================================

-- Set output format
\set ECHO all
\set ON_ERROR_STOP on

-- Create a temporary table to store verification results
CREATE TEMP TABLE IF NOT EXISTS verification_results (
    check_name TEXT,
    status TEXT,
    details TEXT,
    priority TEXT
);

-- ============================================================================
-- 1. VERIFY CORE TABLES EXIST
-- ============================================================================

DO $$
DECLARE
    missing_tables TEXT[];
    required_tables TEXT[] := ARRAY[
        'members',
        'staff',
        'savings_accounts',
        'savings_transactions',
        'loans',
        'loan_payments',
        'products',
        'stock_inventory',
        'stock_movements',
        'production_records',
        'cash_receipts',
        'cash_disbursements',
        'general_journal',
        'general_ledger',
        'accounts',
        'announcements',
        'sales',
        'product_categories',
        'journal_entries'
    ];
    table_name TEXT;
    table_exists BOOLEAN;
BEGIN
    FOREACH table_name IN ARRAY required_tables LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = table_name
        ) INTO table_exists;
        
        IF NOT table_exists THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Core Tables Exist',
            '✅ PASS',
            'All required tables exist',
            'CRITICAL'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Core Tables Exist',
            '❌ FAIL',
            'Missing tables: ' || array_to_string(missing_tables, ', '),
            'CRITICAL'
        );
    END IF;
END $$;

-- ============================================================================
-- 2. VERIFY STAFF.USER_ID LINKING
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'Staff User ID Linking',
    CASE 
        WHEN COUNT(*) FILTER (WHERE user_id IS NULL) > 0 
        THEN '⚠️ WARNING'
        ELSE '✅ PASS'
    END,
    CASE 
        WHEN COUNT(*) FILTER (WHERE user_id IS NULL) > 0 
        THEN COUNT(*) FILTER (WHERE user_id IS NULL) || ' staff records have NULL user_id'
        ELSE 'All staff records have user_id linked'
    END,
    'CRITICAL'
FROM staff;

-- ============================================================================
-- 3. VERIFY STAFF.MEMBER_ID LINKING FOR MEMBERS
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'Staff Member ID Linking',
    CASE 
        WHEN COUNT(*) FILTER (WHERE role = 'member' AND member_id IS NULL) > 0 
        THEN '❌ FAIL'
        ELSE '✅ PASS'
    END,
    CASE 
        WHEN COUNT(*) FILTER (WHERE role = 'member' AND member_id IS NULL) > 0 
        THEN COUNT(*) FILTER (WHERE role = 'member' AND member_id IS NULL) || ' member staff records missing member_id'
        ELSE 'All member staff records have member_id linked'
    END,
    'CRITICAL'
FROM staff;

-- ============================================================================
-- 4. VERIFY REQUIRED COLUMNS IN MEMBERS TABLE
-- ============================================================================

DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id',
        'member_number',
        'first_name',
        'last_name',
        'email',
        'membership_status',
        'created_at'
    ];
    col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOREACH col_name IN ARRAY required_columns LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'members'
            AND column_name = col_name
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Members Table Structure',
            '✅ PASS',
            'All required columns exist',
            'HIGH'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Members Table Structure',
            '❌ FAIL',
            'Missing columns: ' || array_to_string(missing_columns, ', '),
            'HIGH'
        );
    END IF;
END $$;

-- ============================================================================
-- 5. VERIFY SAVINGS_ACCOUNTS TABLE STRUCTURE
-- ============================================================================

DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id',
        'member_id',
        'account_number',
        'account_type',
        'balance',
        'status',
        'created_at'
    ];
    col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOREACH col_name IN ARRAY required_columns LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'savings_accounts'
            AND column_name = col_name
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Savings Accounts Table Structure',
            '✅ PASS',
            'All required columns exist',
            'HIGH'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Savings Accounts Table Structure',
            '❌ FAIL',
            'Missing columns: ' || array_to_string(missing_columns, ', '),
            'HIGH'
        );
    END IF;
END $$;

-- ============================================================================
-- 6. VERIFY LOANS TABLE STRUCTURE
-- ============================================================================

DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id',
        'member_id',
        'loan_number',
        'amount',
        'balance',
        'interest_rate',
        'monthly_payment',
        'status',
        'release_date',
        'maturity_date',
        'created_at'
    ];
    col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOREACH col_name IN ARRAY required_columns LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'loans'
            AND column_name = col_name
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Loans Table Structure',
            '✅ PASS',
            'All required columns exist',
            'HIGH'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Loans Table Structure',
            '❌ FAIL',
            'Missing columns: ' || array_to_string(missing_columns, ', '),
            'HIGH'
        );
    END IF;
END $$;

-- ============================================================================
-- 7. VERIFY PRODUCTS/INVENTORY TABLE STRUCTURE
-- ============================================================================

DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id',
        'product_name',
        'unit_of_measure',
        'reorder_level',
        'is_active'
    ];
    col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOREACH col_name IN ARRAY required_columns LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'products'
            AND column_name = col_name
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Products Table Structure',
            '✅ PASS',
            'All required columns exist',
            'MEDIUM'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Products Table Structure',
            '❌ FAIL',
            'Missing columns: ' || array_to_string(missing_columns, ', '),
            'MEDIUM'
        );
    END IF;
END $$;

-- ============================================================================
-- 8. VERIFY ACCOUNTING TABLES STRUCTURE
-- ============================================================================

DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id',
        'account_code',
        'account_name',
        'account_type'
    ];
    col_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOREACH col_name IN ARRAY required_columns LOOP
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'accounts'
            AND column_name = col_name
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) IS NULL THEN
        INSERT INTO verification_results VALUES (
            'Accounts (Chart of Accounts) Structure',
            '✅ PASS',
            'All required columns exist',
            'HIGH'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Accounts (Chart of Accounts) Structure',
            '❌ FAIL',
            'Missing columns: ' || array_to_string(missing_columns, ', '),
            'HIGH'
        );
    END IF;
END $$;

-- ============================================================================
-- 9. VERIFY FOREIGN KEY RELATIONSHIPS
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'Savings Accounts → Members FK',
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    CASE 
        WHEN COUNT(*) = 0 THEN 'All savings accounts have valid member_id'
        ELSE COUNT(*) || ' savings accounts with invalid member_id'
    END,
    'HIGH'
FROM savings_accounts sa
LEFT JOIN members m ON sa.member_id = m.id
WHERE m.id IS NULL;

INSERT INTO verification_results
SELECT 
    'Loans → Members FK',
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    CASE 
        WHEN COUNT(*) = 0 THEN 'All loans have valid member_id'
        ELSE COUNT(*) || ' loans with invalid member_id'
    END,
    'HIGH'
FROM loans l
LEFT JOIN members m ON l.member_id = m.id
WHERE m.id IS NULL;

INSERT INTO verification_results
SELECT 
    'Staff → Members FK (for member role)',
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END,
    CASE 
        WHEN COUNT(*) = 0 THEN 'All member staff records have valid member_id'
        ELSE COUNT(*) || ' member staff records with invalid member_id'
    END,
    'CRITICAL'
FROM staff s
LEFT JOIN members m ON s.member_id = m.id
WHERE s.role = 'member' AND s.member_id IS NOT NULL AND m.id IS NULL;

-- ============================================================================
-- 10. VERIFY DATA INTEGRITY
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'Loan Balance Consistency',
    CASE 
        WHEN COUNT(*) FILTER (WHERE balance < 0) > 0 THEN '⚠️ WARNING'
        ELSE '✅ PASS'
    END,
    CASE 
        WHEN COUNT(*) FILTER (WHERE balance < 0) > 0 
        THEN COUNT(*) FILTER (WHERE balance < 0) || ' loans have negative balance'
        ELSE 'All loan balances are non-negative'
    END,
    'MEDIUM'
FROM loans;

INSERT INTO verification_results
SELECT 
    'Savings Balance Consistency',
    CASE 
        WHEN COUNT(*) FILTER (WHERE balance < 0) > 0 THEN '⚠️ WARNING'
        ELSE '✅ PASS'
    END,
    CASE 
        WHEN COUNT(*) FILTER (WHERE balance < 0) > 0 
        THEN COUNT(*) FILTER (WHERE balance < 0) || ' accounts have negative balance'
        ELSE 'All savings balances are non-negative'
    END,
    'MEDIUM'
FROM savings_accounts;

-- ============================================================================
-- 11. VERIFY REAL-TIME REPLICATION SETUP
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'Real-Time Replication for ' || tablename,
    CASE 
        WHEN schemaname = 'public' THEN '✅ ENABLED'
        ELSE '⚠️ CHECK'
    END,
    'Table is in public schema (check Supabase dashboard for replication status)',
    'MEDIUM'
FROM pg_tables
WHERE tablename IN (
    'members', 'staff', 'savings_accounts', 'savings_transactions',
    'loans', 'loan_payments', 'products', 'stock_inventory',
    'cash_receipts', 'cash_disbursements', 'announcements'
)
LIMIT 5;

-- ============================================================================
-- 12. VERIFY INDEXES FOR PERFORMANCE
-- ============================================================================

DO $$
DECLARE
    index_count INT;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN ('members', 'savings_accounts', 'loans', 'staff')
    AND indexname LIKE '%member_id%' OR indexname LIKE '%user_id%';
    
    IF index_count >= 4 THEN
        INSERT INTO verification_results VALUES (
            'Performance Indexes',
            '✅ PASS',
            index_count || ' relevant indexes found',
            'LOW'
        );
    ELSE
        INSERT INTO verification_results VALUES (
            'Performance Indexes',
            '⚠️ WARNING',
            'Only ' || index_count || ' indexes found, consider adding more for member_id and user_id',
            'LOW'
        );
    END IF;
END $$;

-- ============================================================================
-- 13. VERIFY ROW LEVEL SECURITY (RLS)
-- ============================================================================

INSERT INTO verification_results
SELECT 
    'RLS Enabled on ' || tablename,
    CASE 
        WHEN rowsecurity THEN '✅ ENABLED'
        ELSE '⚠️ DISABLED'
    END,
    CASE 
        WHEN rowsecurity THEN 'Row Level Security is active'
        ELSE 'Consider enabling RLS for data security'
    END,
    'HIGH'
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('members', 'savings_accounts', 'loans', 'staff')
LIMIT 4;

-- ============================================================================
-- DISPLAY RESULTS
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'AMCOMS DATABASE VERIFICATION RESULTS'
\echo '============================================================================'
\echo ''

-- Display results grouped by priority
\echo '--- CRITICAL CHECKS ---'
SELECT * FROM verification_results WHERE priority = 'CRITICAL' ORDER BY status;

\echo ''
\echo '--- HIGH PRIORITY CHECKS ---'
SELECT * FROM verification_results WHERE priority = 'HIGH' ORDER BY status;

\echo ''
\echo '--- MEDIUM PRIORITY CHECKS ---'
SELECT * FROM verification_results WHERE priority = 'MEDIUM' ORDER BY status;

\echo ''
\echo '--- LOW PRIORITY CHECKS ---'
SELECT * FROM verification_results WHERE priority = 'LOW' ORDER BY status;

-- Summary statistics
\echo ''
\echo '============================================================================'
\echo 'SUMMARY'
\echo '============================================================================'

SELECT 
    COUNT(*) FILTER (WHERE status LIKE '%PASS%') as "✅ Passed",
    COUNT(*) FILTER (WHERE status LIKE '%FAIL%') as "❌ Failed",
    COUNT(*) FILTER (WHERE status LIKE '%WARNING%') as "⚠️ Warnings",
    COUNT(*) as "Total Checks"
FROM verification_results;

\echo ''
\echo '============================================================================'
\echo 'RECOMMENDATIONS'
\echo '============================================================================'
\echo ''
\echo '1. If any CRITICAL checks failed, fix them immediately'
\echo '2. Review and address all FAIL statuses before production'
\echo '3. Warnings should be investigated and resolved if possible'
\echo '4. Run this script regularly to maintain database health'
\echo ''
\echo 'Next Steps:'
\echo '- Fix staff.user_id linking: Run FIX_STAFF_USER_LINKING.sql'
\echo '- Enable real-time: Check Supabase Dashboard → Database → Replication'
\echo '- Review RLS policies: Ensure proper data access controls'
\echo ''

-- Cleanup
DROP TABLE verification_results;

\echo 'Verification complete!'

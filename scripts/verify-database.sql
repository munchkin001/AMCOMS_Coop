-- ============================================
-- AMCOMS Database Verification Script
-- ============================================
-- Run this in Supabase SQL Editor to verify your database setup
-- Date: 2026-09-20

-- ============================================
-- 1. CHECK TABLES EXIST
-- ============================================
SELECT 
    'Tables Check' as check_type,
    COUNT(*) as tables_found,
    array_agg(tablename ORDER BY tablename) as table_list
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'staff', 'members', 'loans', 'requests', 'transactions',
    'cash_receipts', 'cash_receipt_lines', 'products', 
    'stock_movements', 'accounts', 'savings_accounts',
    'loan_payments', 'time_deposits'
);

-- ============================================
-- 2. CHECK STAFF TABLE STRUCTURE
-- ============================================
SELECT 
    'Staff Table Structure' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'staff'
ORDER BY ordinal_position;

-- ============================================
-- 3. CHECK EXISTING USERS AND ROLES
-- ============================================
SELECT 
    'Existing Staff Users' as check_type,
    s.email,
    s.first_name,
    s.last_name,
    s.role,
    s.is_active,
    CASE 
        WHEN s.user_id IS NOT NULL THEN '✓ Has Auth'
        ELSE '✗ No Auth'
    END as auth_status,
    CASE 
        WHEN s.member_id IS NOT NULL THEN '✓ Has Member'
        ELSE '○ Not Member'
    END as member_status
FROM staff s
ORDER BY 
    CASE s.role
        WHEN 'chairman' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'treasurer' THEN 3
        WHEN 'bookkeeper' THEN 4
        WHEN 'inventory' THEN 5
        WHEN 'member' THEN 6
        ELSE 7
    END;

-- ============================================
-- 4. CHECK FOR MISSING ROLES
-- ============================================
WITH required_roles AS (
    SELECT unnest(ARRAY['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member']) as role
),
existing_roles AS (
    SELECT DISTINCT role FROM staff WHERE is_active = true
)
SELECT 
    'Missing Roles' as check_type,
    rr.role as missing_role,
    '⚠️ Create user for this role' as action_needed
FROM required_roles rr
LEFT JOIN existing_roles er ON rr.role = er.role
WHERE er.role IS NULL;

-- ============================================
-- 5. CHECK AUTH USERS WITHOUT STAFF PROFILE
-- ============================================
SELECT 
    'Auth Users Without Staff Profile' as check_type,
    au.email,
    au.created_at,
    '⚠️ Create staff record' as action_needed
FROM auth.users au
LEFT JOIN staff s ON s.user_id = au.id
WHERE s.id IS NULL;

-- ============================================
-- 6. CHECK STAFF WITHOUT AUTH USER
-- ============================================
SELECT 
    'Staff Without Auth User' as check_type,
    s.email,
    s.first_name,
    s.last_name,
    s.role,
    '⚠️ Create auth user' as action_needed
FROM staff s
WHERE s.user_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = s.user_id);

-- ============================================
-- 7. CHECK MEMBERS TABLE
-- ============================================
SELECT 
    'Members Count' as check_type,
    COUNT(*) as total_members,
    SUM(CASE WHEN membership_status = 'active' THEN 1 ELSE 0 END) as active_members,
    SUM(CASE WHEN membership_status = 'inactive' THEN 1 ELSE 0 END) as inactive_members
FROM members;

-- ============================================
-- 8. CHECK MEMBER USERS
-- ============================================
SELECT 
    'Member Portal Users' as check_type,
    s.email,
    m.member_number,
    m.first_name || ' ' || m.last_name as member_name,
    m.membership_status,
    s.is_active as staff_active
FROM staff s
INNER JOIN members m ON s.member_id = m.id
WHERE s.role = 'member'
ORDER BY m.member_number;

-- ============================================
-- 9. CHECK RLS POLICIES
-- ============================================
SELECT 
    'RLS Policies Check' as check_type,
    schemaname,
    tablename,
    COUNT(*) as policy_count,
    bool_and(CASE WHEN rowsecurity THEN true ELSE false END) as rls_enabled
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ============================================
-- 10. CHECK KEY FOREIGN KEYS
-- ============================================
SELECT 
    'Foreign Keys Check' as check_type,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('staff', 'loans', 'requests', 'transactions', 'cash_receipts')
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 11. CHECK DATA IN KEY TABLES
-- ============================================
SELECT 'Data Summary' as check_type,
       'staff' as table_name,
       COUNT(*) as record_count
FROM staff
UNION ALL
SELECT 'Data Summary', 'members', COUNT(*) FROM members
UNION ALL
SELECT 'Data Summary', 'loans', COUNT(*) FROM loans
UNION ALL
SELECT 'Data Summary', 'requests', COUNT(*) FROM requests
UNION ALL
SELECT 'Data Summary', 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'Data Summary', 'cash_receipts', COUNT(*) FROM cash_receipts
UNION ALL
SELECT 'Data Summary', 'products', COUNT(*) FROM products
UNION ALL
SELECT 'Data Summary', 'stock_movements', COUNT(*) FROM stock_movements
ORDER BY table_name;

-- ============================================
-- 12. CHECK FOR INACTIVE STAFF
-- ============================================
SELECT 
    'Inactive Staff' as check_type,
    email,
    first_name,
    last_name,
    role,
    '⚠️ This user cannot log in' as warning
FROM staff
WHERE is_active = false;

-- ============================================
-- 13. ROLE VALIDATION
-- ============================================
SELECT 
    'Invalid Roles Check' as check_type,
    email,
    first_name,
    last_name,
    role as current_role,
    '⚠️ Role must be: chairman, manager, treasurer, bookkeeper, inventory, or member' as error
FROM staff
WHERE role NOT IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member')
   OR role IS NULL;

-- ============================================
-- 14. CHECK ENVIRONMENT SETUP
-- ============================================
-- This checks if basic app requirements are met
SELECT 
    'System Requirements' as check_type,
    (SELECT COUNT(*) FROM staff WHERE is_active = true) >= 6 as has_all_roles,
    (SELECT COUNT(*) FROM members WHERE membership_status = 'active') >= 1 as has_active_members,
    (SELECT COUNT(*) FROM accounts) >= 5 as has_accounts_configured,
    (SELECT COUNT(*) FROM products) >= 1 as has_products
FROM (SELECT 1) as dummy;

-- ============================================
-- SUMMARY AND RECOMMENDATIONS
-- ============================================
\echo ''
\echo '============================================'
\echo 'VERIFICATION COMPLETE'
\echo '============================================'
\echo ''
\echo 'Review the results above:'
\echo '1. All required tables should exist'
\echo '2. Each role should have at least one active user'
\echo '3. Staff records should have matching auth users'
\echo '4. RLS policies should be enabled'
\echo '5. At least one member should exist'
\echo ''
\echo 'If any checks failed, use the SQL scripts in'
\echo 'LOGIN_ISSUE_FIX.md to create missing users.'
\echo '============================================'

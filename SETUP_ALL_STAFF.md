# Setup ALL Staff Roles - Complete Guide

This guide ensures **all 5 staff roles** can login and see their respective dashboards.

## 🎯 The 5 Staff Roles

1. **Chairman** - Oversight and governance
2. **Manager** - Operations management  
3. **Treasurer** - Financial monitoring
4. **Bookkeeper** - Transaction recording
5. **Inventory** - Stock management

All 5 roles use the **Staff Portal** but see different modules based on their role.

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Create Auth Users in Supabase Dashboard

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **"Add User"** button
3. Create these 5 users:

| Email | Password | Auto Confirm |
|-------|----------|--------------|
| `chairman@amcoms.com` | `chairman123` | ✅ YES |
| `manager@amcoms.com` | `manager123` | ✅ YES |
| `treasurer@amcoms.com` | `treasurer123` | ✅ YES |
| `bookkeeper@amcoms.com` | `bookkeeper123` | ✅ YES |
| `inventory@amcoms.com` | `inventory123` | ✅ YES |

**Important:** Check the **"Auto Confirm Email"** box for each user!

### Step 2: Run ULTIMATE_FIX.sql

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy ALL content from `ULTIMATE_FIX.sql`
3. Click **"Run"**
4. Review the output - it will show you the status of each role

### Step 3: Verify All Staff Can Login

Run this query to verify:

```sql
SELECT 
  email,
  full_name,
  role,
  is_active,
  CASE 
    WHEN user_id IS NOT NULL AND is_active THEN '✅ CAN LOGIN'
    ELSE '❌ CANNOT LOGIN'
  END as login_status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY 
  CASE role
    WHEN 'chairman' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'treasurer' THEN 3
    WHEN 'bookkeeper' THEN 4
    WHEN 'inventory' THEN 5
  END;
```

**Expected:** All 5 rows show `✅ CAN LOGIN`

---

## 🧪 Test Each Role

### Test Chairman
```
URL: http://localhost:5173/login/staff
Email: chairman@amcoms.com
Password: chairman123

✅ Should redirect to: /staff
✅ Should see: Dashboard, Performance Report, Audit Log, Policies, Settings
```

### Test Manager
```
URL: http://localhost:5173/login/staff
Email: manager@amcoms.com
Password: manager123

✅ Should redirect to: /staff
✅ Should see: Dashboard, Members, Loans, Financial Tracking, Reports, Announcements, SMS Center, Settings
```

### Test Treasurer
```
URL: http://localhost:5173/login/staff
Email: treasurer@amcoms.com
Password: treasurer123

✅ Should redirect to: /staff
✅ Should see: Dashboard, Financial Monitoring, Transactions, Reports, Settings
```

### Test Bookkeeper
```
URL: http://localhost:5173/login/staff
Email: bookkeeper@amcoms.com
Password: bookkeeper123

✅ Should redirect to: /staff
✅ Should see: Dashboard, Transactions, Books, Reports, Settings
```

### Test Inventory
```
URL: http://localhost:5173/login/staff
Email: inventory@amcoms.com
Password: inventory123

✅ Should redirect to: /staff
✅ Should see: Dashboard, Inventory, Stock Movement, Reports, Settings
```

---

## 📋 Testing Checklist

Mark each as you test:

- [ ] Chairman can login and see Chairman dashboard
- [ ] Manager can login and see Manager dashboard
- [ ] Treasurer can login and see Treasurer dashboard
- [ ] Bookkeeper can login and see Bookkeeper dashboard
- [ ] Inventory can login and see Inventory dashboard
- [ ] Each role sees ONLY their assigned modules
- [ ] All redirects go to `/staff` (not separate portals)
- [ ] Browser console shows no errors
- [ ] Each role has different sidebar navigation

---

## 🔧 Troubleshooting

### Issue: "No staff profile found"

**Solution 1:** Run ULTIMATE_FIX.sql - it will create missing records

**Solution 2:** Create staff record manually:
```sql
-- Replace 'ROLE' with: chairman, manager, treasurer, bookkeeper, or inventory
INSERT INTO staff (email, full_name, role, is_active, user_id)
SELECT 
  'ROLE@amcoms.com',
  'ROLE User',
  'ROLE',
  true,
  id
FROM auth.users 
WHERE email = 'ROLE@amcoms.com';
```

### Issue: "Unable to load user profile"

**Cause:** RLS is blocking the query or staff record not linked

**Solution:** Run SIMPLE_FIX.sql:
```sql
-- Disable RLS
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Link all staff to auth users
UPDATE staff s
SET user_id = u.id, is_active = true
FROM auth.users u
WHERE s.email = u.email;
```

### Issue: Wrong dashboard shows for a role

**Cause:** Role field has wrong value

**Solution:** Check and fix role:
```sql
-- Check current role
SELECT email, role FROM staff WHERE email = 'user@amcoms.com';

-- Fix role (use exact lowercase values)
UPDATE staff 
SET role = 'chairman'  -- or: manager, treasurer, bookkeeper, inventory
WHERE email = 'user@amcoms.com';
```

### Issue: Some staff can login, others cannot

**Cause:** Incomplete setup

**Solution:** Run this to check who's missing:
```sql
-- Show which roles are missing or broken
SELECT 
  role,
  COUNT(*) as count,
  SUM(CASE WHEN user_id IS NOT NULL AND is_active THEN 1 ELSE 0 END) as can_login,
  SUM(CASE WHEN user_id IS NULL OR NOT is_active THEN 1 ELSE 0 END) as cannot_login
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
GROUP BY role;
```

---

## 🎨 What Each Role Sees (Dashboard Preview)

### Chairman Dashboard
- **Focus:** High-level oversight
- **Widgets:**
  - Total members (active/inactive/new)
  - Active loans & outstanding amount
  - Savings & time deposits summary
  - Financial overview (income, receipts, disbursements, cash flow)

### Manager Dashboard
- **Focus:** Operational decisions
- **Widgets:**
  - Pending member applications
  - Pending loan applications (needs approval)
  - Active loans
  - Recent transactions
  - Financial overview
  - Pending actions queue

### Treasurer Dashboard
- **Focus:** Financial position monitoring
- **Widgets:**
  - Cash position (current balance)
  - Today's cash receipts
  - Today's cash disbursements
  - Savings & time deposits
  - Active loans
  - Recent financial transactions

### Bookkeeper Dashboard
- **Focus:** Daily transaction work
- **Widgets:**
  - Quick entry shortcuts
  - Today's receipts & disbursements
  - Unposted drafts (needs posting)
  - Recent entries
  - Transaction statistics

### Inventory Dashboard
- **Focus:** Stock management
- **Widgets:**
  - Total products count
  - Current stock levels
  - Low stock alerts (below reorder level)
  - Recent stock-in movements
  - Recent stock-out movements
  - Products by category

---

## 📊 Database Schema Requirements

For all staff roles to work, ensure your `staff` table has:

```sql
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,  -- Must be: chairman, manager, treasurer, bookkeeper, or inventory
  username TEXT,
  employee_number TEXT,
  is_active BOOLEAN DEFAULT true,
  member_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Important: RLS should be DISABLED for testing
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
```

---

## 🔐 Role-Based Access Control

All 5 roles access `/staff` portal but see different modules:

| Module | Chairman | Manager | Treasurer | Bookkeeper | Inventory |
|--------|----------|---------|-----------|------------|-----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance Report | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit Log | ✅ | ✅ | ❌ | ❌ | ❌ |
| Policies | ✅ | ❌ | ❌ | ❌ | ❌ |
| Members | ❌ | ✅ | ❌ | ❌ | ❌ |
| Loans | ❌ | ✅ | ❌ | ❌ | ❌ |
| Financial Tracking | ❌ | ✅ | ❌ | ❌ | ❌ |
| Financial Monitoring | ❌ | ❌ | ✅ | ❌ | ❌ |
| Transactions | ❌ | ❌ | ✅ | ✅ | ❌ |
| Books | ❌ | ❌ | ❌ | ✅ | ❌ |
| Inventory | ❌ | ❌ | ❌ | ❌ | ✅ |
| Stock Movement | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Announcements | ❌ | ✅ | ❌ | ❌ | ❌ |
| SMS Center | ❌ | ✅ | ❌ | ❌ | ❌ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## ✅ Success Criteria

You've successfully set up ALL staff roles when:

1. ✅ All 5 users exist in Supabase Auth
2. ✅ All 5 staff records exist in staff table
3. ✅ All 5 records have `is_active = true`
4. ✅ All 5 records have `user_id` linked to auth.users
5. ✅ All 5 roles can login at `/login/staff`
6. ✅ All 5 redirect to `/staff` after login
7. ✅ Each role sees their specific dashboard
8. ✅ Each role has role-appropriate sidebar navigation
9. ✅ No console errors during login or dashboard load
10. ✅ Logout works for all roles

---

## 🚦 Quick Status Check

Run this one query to see everything:

```sql
SELECT 
  CASE role
    WHEN 'chairman' THEN '1. 👔 Chairman'
    WHEN 'manager' THEN '2. 🎯 Manager'
    WHEN 'treasurer' THEN '3. 💰 Treasurer'
    WHEN 'bookkeeper' THEN '4. 📊 Bookkeeper'
    WHEN 'inventory' THEN '5. 📦 Inventory'
  END as role_display,
  email,
  full_name,
  is_active,
  CASE 
    WHEN user_id IS NOT NULL AND is_active THEN '✅ READY'
    WHEN user_id IS NULL THEN '❌ NOT LINKED'
    WHEN NOT is_active THEN '❌ INACTIVE'
  END as status
FROM staff
WHERE role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory')
ORDER BY role_display;
```

**Perfect output:** All 5 rows show `✅ READY`

---

**Last Updated:** December 2024  
**Status:** ✅ Complete setup guide for all 5 staff roles

# ⚡ Quick Start - Setup All 5 Staff Roles

**Goal:** Get Chairman, Manager, Treasurer, Bookkeeper, and Inventory all able to login.

**Time needed:** 5-10 minutes

---

## 🎯 Step 1: Create Auth Users (Supabase Dashboard)

1. Open **Supabase Dashboard**
2. Go to **Authentication** → **Users**
3. Click **"Add User"** 5 times and create:

```
chairman@amcoms.com      password: chairman123      ✅ Auto Confirm
manager@amcoms.com       password: manager123       ✅ Auto Confirm
treasurer@amcoms.com     password: treasurer123     ✅ Auto Confirm
bookkeeper@amcoms.com    password: bookkeeper123    ✅ Auto Confirm
inventory@amcoms.com     password: inventory123     ✅ Auto Confirm
```

**Important:** Check "Auto Confirm Email" for each!

---

## 🎯 Step 2: Run ULTIMATE_FIX.sql

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy **ALL** content from `ULTIMATE_FIX.sql`
3. Click **"Run"**
4. Wait for it to complete

This script will:
- ✅ Disable RLS (removes access blocks)
- ✅ Create all 5 staff records
- ✅ Link them to auth users
- ✅ Set all to active
- ✅ Show you the final status

---

## 🎯 Step 3: Verify Setup

Run `VERIFY_ALL_STAFF.sql` to check everything:

1. Open **SQL Editor**
2. Copy content from `VERIFY_ALL_STAFF.sql`
3. Click **"Run"**
4. Look for: **"✅ PERFECT - ALL 5 STAFF CAN LOGIN"**

---

## 🎯 Step 4: Test Login

Test each role at: `http://localhost:5173/login/staff`

| Email | Password | Expected Dashboard |
|-------|----------|-------------------|
| chairman@amcoms.com | chairman123 | Chairman Dashboard |
| manager@amcoms.com | manager123 | Manager Dashboard |
| treasurer@amcoms.com | treasurer123 | Treasurer Dashboard |
| bookkeeper@amcoms.com | bookkeeper123 | Bookkeeper Dashboard |
| inventory@amcoms.com | inventory123 | Inventory Dashboard |

---

## ✅ Success!

If all 5 staff can login and see their dashboards, you're done! 🎉

Each role should:
- ✅ Login at `/login/staff`
- ✅ Redirect to `/staff` after login
- ✅ See their role-specific sidebar
- ✅ See their role-specific dashboard widgets

---

## ❌ Troubleshooting

### Problem: "Unable to load user profile"

**Fix:**
```sql
-- Disable RLS
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Link staff to auth
UPDATE staff s
SET user_id = u.id, is_active = true
FROM auth.users u
WHERE s.email = u.email;
```

### Problem: "No staff profile found"

**Fix:** Run `ULTIMATE_FIX.sql` - it creates missing records

### Problem: Some work, others don't

**Fix:** Run `VERIFY_ALL_STAFF.sql` to see which ones are broken, then run `ULTIMATE_FIX.sql`

---

## 📚 Files Reference

- **`ULTIMATE_FIX.sql`** - Fixes everything automatically
- **`VERIFY_ALL_STAFF.sql`** - Checks status of all 5 roles
- **`SIMPLE_FIX.sql`** - Quick RLS disable + linking
- **`SETUP_ALL_STAFF.md`** - Detailed guide with all info
- **`TEST_LOGIN_NOW.md`** - Testing guide
- **`CREATE_TEST_USERS.sql`** - Original test user script

---

**TL;DR:**
1. Create 5 auth users in Supabase Dashboard
2. Run ULTIMATE_FIX.sql
3. Run VERIFY_ALL_STAFF.sql  
4. Test login for all 5 roles

**Done!** ✨

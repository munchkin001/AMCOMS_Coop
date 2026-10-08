# Quick Test Guide - Login to Dashboard

## ✅ What Was Fixed

Your login flow now properly redirects users to their respective dashboards after successful authentication.

## 🚀 Test It Now

### Option 1: Use Existing Test Credentials

If you've already run `CREATE_TEST_USERS.sql`, try these:

**Staff Portal:**
```
URL: http://localhost:5173/login/staff

Test with:
- Email: chairman@amcoms.com      | Password: chairman123
- Email: manager@amcoms.com       | Password: manager123  
- Email: treasurer@amcoms.com     | Password: treasurer123
- Email: bookkeeper@amcoms.com    | Password: bookkeeper123
- Email: inventory@amcoms.com     | Password: inventory123
```

**Member Portal:**
```
URL: http://localhost:5173/login/member

Test with:
- Email: member@amcoms.com        | Password: member123
```

### Option 2: Use Your Own Credentials

If you have existing users in your Supabase database:

1. Go to Supabase Dashboard → Authentication → Users
2. Find a user's email
3. Test login with that email and password

## 📝 What Should Happen

### For Staff Users (chairman, manager, treasurer, bookkeeper, inventory):

1. Go to: `http://localhost:5173/login/staff`
2. Enter email and password
3. Click "LOGIN"
4. **✅ Should redirect to:** `/staff` (Staff Dashboard)
5. **✅ Should see:** Staff Portal with role-specific sidebar

### For Member Users:

1. Go to: `http://localhost:5173/login/member`
2. Enter email and password
3. Click "LOGIN"
4. **✅ Should redirect to:** `/member` (Member Dashboard)
5. **✅ Should see:** Member Portal

## 🐛 If It Doesn't Work

### Check 1: Verify Test Users Exist

Run this in Supabase SQL Editor:

```sql
-- Check auth users
SELECT email FROM auth.users;

-- Check staff records
SELECT email, role, is_active FROM staff;
```

### Check 2: Check Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. Look for these messages:
   - "Attempting login for: [email]"
   - "Sign in successful, staff profile should load automatically"
   - "Staff profile loaded during login, validating and redirecting..."
   - "Navigating to Staff Portal at /staff"

### Check 3: Common Errors

**Error: "No staff profile found"**
- Means: Email exists in auth.users but NOT in staff table
- Fix: Run the INSERT statements in CREATE_TEST_USERS.sql

**Error: "Invalid email or password"**
- Means: Wrong credentials OR user doesn't exist
- Fix: Create user in Supabase Dashboard → Authentication → Add User

**Error: "Unable to load user profile"**
- Means: Database query failed or RLS blocking
- Fix: Check Supabase logs, verify RLS policies

**Stuck on "Logging in..."**
- Means: Request hanging or staff profile not loading
- Fix: Check network tab in DevTools, check Supabase connection

## 🔧 Quick Setup If No Test Users Exist

### Step 1: Create Auth Users (Supabase Dashboard)

1. Go to Supabase Dashboard
2. Click **Authentication** → **Users**
3. Click **Add User**
4. Create at least one test user:
   - Email: `test@amcoms.com`
   - Password: `test123456`
   - ✅ Check "Auto Confirm Email"
   - Click "Create User"

### Step 2: Create Staff Record (SQL Editor)

Run this in Supabase SQL Editor:

```sql
-- Create staff record linked to the auth user
INSERT INTO staff (user_id, email, full_name, role, is_active)
SELECT 
  id,
  'test@amcoms.com',
  'Test User',
  'bookkeeper',  -- or any role: chairman, manager, treasurer, bookkeeper, inventory, member
  true
FROM auth.users
WHERE email = 'test@amcoms.com';

-- Verify it was created
SELECT email, full_name, role, is_active FROM staff WHERE email = 'test@amcoms.com';
```

### Step 3: Test Login

1. Go to: `http://localhost:5173/login/staff`
2. Email: `test@amcoms.com`
3. Password: `test123456`
4. Click LOGIN
5. **Should redirect to Staff Portal!**

## 📊 Test Checklist

Test each scenario and check it off:

- [ ] Staff user can log into Staff Portal
- [ ] Redirects to `/staff` after successful login
- [ ] Member user can log into Member Portal  
- [ ] Redirects to `/member` after successful login
- [ ] Staff user CANNOT access Member Portal (shows error)
- [ ] Member user CANNOT access Staff Portal (shows error)
- [ ] Invalid credentials show error message
- [ ] "Remember me" checkbox works
- [ ] "Show/Hide password" toggle works
- [ ] Browser console shows proper logs (no errors)

## 💡 Pro Tips

**Tip 1: Check Role in Database**
```sql
-- See what role is assigned to each email
SELECT email, role, is_active FROM staff;
```

**Tip 2: Update Role if Needed**
```sql
-- Change a user's role
UPDATE staff 
SET role = 'chairman'  -- or manager, treasurer, bookkeeper, inventory, member
WHERE email = 'test@amcoms.com';
```

**Tip 3: Activate/Deactivate Users**
```sql
-- Deactivate a user
UPDATE staff SET is_active = false WHERE email = 'test@amcoms.com';

-- Reactivate a user
UPDATE staff SET is_active = true WHERE email = 'test@amcoms.com';
```

## 🎯 Expected Flow Diagram

```
User enters credentials
         ↓
    Click LOGIN
         ↓
  Validate inputs
         ↓
   signIn() called
         ↓
Supabase authenticates
         ↓
Fetch staff profile (auto)
         ↓
  Validate portal access
         ↓
Redirect to dashboard
         ↓
    ✅ SUCCESS!
```

## 📞 Need Help?

If login still doesn't work after trying these steps:

1. Check `LOGIN_FIX_SUMMARY.md` for detailed debugging
2. Review console logs for specific errors
3. Verify your `staff` table schema matches requirements
4. Check if RLS policies are blocking access
5. Ensure Supabase connection is working

---

**Status**: ✅ Ready to test
**Priority**: Start with test credentials, then try your own users
**Time needed**: 2-5 minutes

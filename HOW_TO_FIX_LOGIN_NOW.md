# 🚨 URGENT: How to Fix Login Issue RIGHT NOW

## Problem
Users can't log in even with correct email/password. Error: "Failed to load user profile"

## Root Cause
The `staff.user_id` column is not linked to `auth.users.id`

## Solution (5 minutes)

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your AMCOMS project

### Step 2: Open SQL Editor
1. Click **"SQL Editor"** in the left sidebar
2. Click **"New query"** button (top right)

### Step 3: Run the Fix
1. Open the file: `AMCOMS/URGENT_FIX_LOGIN.sql`
2. Copy the ENTIRE contents of that file
3. Paste into the SQL Editor in Supabase
4. Click the **"Run"** button (or press Ctrl+Enter)

### Step 4: Check Results
Look at the output tables:

**Table 1 - "Before Fix - Unlinked Staff"**
- Shows how many staff records need fixing

**Table 2 - "After Fix - Still Unlinked"**
- Should show **count = 0** if successful
- If count > 0, see "Alternative Fix" below

**Table 3 - Login Status**
- Shows all staff with their login status
- All should say **"LINKED - Can Login"**

### Step 5: Test Login
1. Go back to your AMCOMS application
2. Try logging in with:
   - chairman@amcoms.com
   - manager@amcoms.com
   - treasurer@amcoms.com
   - bookkeeper@amcoms.com
   - inventory@amcoms.com
   - member@amcoms.com

**Expected Result**: Login should work immediately!

---

## Alternative Fix (If SQL Script Shows Unlinked Staff)

If Step 4 shows staff still unlinked, those emails don't have auth users yet.

### Create Auth Users Manually

1. In Supabase Dashboard, go to **Authentication** → **Users**
2. Click **"Add user"** button
3. For each unlinked staff member:
   - **Email**: (their email from staff table)
   - **Password**: Create a temporary password (e.g., "TempPass123!")
   - **Auto Confirm User**: ✅ Check this box
   - Click **"Create user"**

4. After creating auth users, run `URGENT_FIX_LOGIN.sql` again

---

## Verification Checklist

- [ ] Opened Supabase Dashboard
- [ ] Ran URGENT_FIX_LOGIN.sql script
- [ ] Verified "After Fix" count = 0
- [ ] Tested login with at least one user
- [ ] Login works successfully

---

## If Still Not Working

### Check 1: Is the staff account active?
```sql
SELECT email, is_active FROM staff WHERE email = 'your@email.com';
```
If `is_active` = false, set it to true:
```sql
UPDATE staff SET is_active = true WHERE email = 'your@email.com';
```

### Check 2: Does auth user exist?
```sql
SELECT email FROM auth.users WHERE email = 'your@email.com';
```
If no result, create the auth user manually (see "Alternative Fix" above)

### Check 3: Are they linked?
```sql
SELECT 
  s.email,
  s.user_id as staff_user_id,
  u.id as auth_user_id
FROM staff s
LEFT JOIN auth.users u ON u.email = s.email
WHERE s.email = 'your@email.com';
```
Both IDs should match. If not, run:
```sql
UPDATE staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND s.email = 'your@email.com';
```

---

## Available Test Accounts

Based on your screenshot, these accounts exist:

| Email | Role | Last Login |
|-------|------|------------|
| bookkeeper@amcoms.com | Bookkeeper | Sep 25, 2026 |
| chairman@amcoms.com | Chairman | Sep 26, 2026 |
| inventory@amcoms.com | Inventory | Sep 25, 2026 |
| llantoshakinah@gmail.com | (Unknown) | Sep 22, 2026 |
| manager@amcoms.com | Manager | Sep 29, 2026 |
| member@amcoms.com | Member | Sep 29, 2026 |
| princeyy424@gmail.com | (Unknown) | Sep 24, 2026 |
| treasurer@amcoms.com | Treasurer | Sep 25, 2026 |

Try logging in with **chairman@amcoms.com** first (use the correct password you set)

---

## Emergency Contact

If nothing works:
1. Check browser console (F12) for error messages
2. Take screenshot of error
3. Check Supabase logs: Dashboard → Logs → API
4. Verify .env.local has correct Supabase URL and keys

---

## Success Indicators

✅ No error messages in console  
✅ Dashboard loads after login  
✅ User name appears in header  
✅ Sidebar shows role-appropriate menu items  

---

**Time Required**: 5 minutes  
**Difficulty**: Easy (just copy-paste SQL)  
**Impact**: Fixes login for ALL users immediately

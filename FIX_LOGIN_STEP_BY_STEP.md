# 🔧 Fix Login Issue - Step by Step Guide

## Your Current Problem
✅ Users exist in database (you showed me the list)  
✅ Email and password are correct  
❌ Login fails with "Failed to load user profile"  

**Root Cause**: Staff records are not linked to authentication users

**Time to Fix**: 2 minutes  
**Difficulty**: Very Easy - Just copy & paste!

---

## 📋 Step-by-Step Instructions

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Find your AMCOMS project (the one with URL: `gfefilzhdbotutiocezz.supabase.co`)
3. Click on it to open

### Step 2: Navigate to SQL Editor
Look at the left sidebar and click on:
- **"SQL Editor"** (looks like a document icon)

You should see a blank SQL editor area.

### Step 3: Open the Fix Script
On your computer:
1. Open File Explorer
2. Navigate to: `C:\Users\Shakinah\OneDrive\Desktop\AMCOMS\AMCOMS\`
3. Find file: **`URGENT_FIX_LOGIN.sql`**
4. Right-click → Open with → Notepad (or any text editor)
5. Press `Ctrl+A` (select all)
6. Press `Ctrl+C` (copy)

### Step 4: Run the Fix in Supabase
Back in Supabase SQL Editor:
1. Click in the empty editor area
2. Press `Ctrl+V` (paste the SQL script)
3. You should see the SQL commands appear
4. Click the **green "RUN"** button (top right of editor)
   - OR press `Ctrl+Enter`

### Step 5: Check the Results
After clicking RUN, you'll see output tables below:

**Look for this table: "After Fix - Still Unlinked"**
- If **count = 0**: ✅ SUCCESS! Fixed!
- If **count > 0**: 📋 See "Extra Step" below

**Also look at the last table showing all staff**
- Each row should say **"LINKED - Can Login"**

### Step 6: Test Login Immediately
1. Go back to your AMCOMS application login page
2. Try logging in with:
   ```
   Email: chairman@amcoms.com
   Password: (your password)
   ```

**Expected Result**: You should be logged in and see the Chairman Dashboard!

---

## ✅ Success Indicators

After running the SQL script, you should see:

1. **In Supabase Results**:
   - "After Fix - Still Unlinked" count: **0**
   - All staff show status: **"LINKED - Can Login"**

2. **In AMCOMS Application**:
   - Login page accepts credentials
   - No "Failed to load user profile" error
   - Dashboard loads successfully
   - User name appears in header

---

## 🔄 Extra Step (Only if Still Showing Unlinked Staff)

If the script shows some staff are still unlinked, those emails don't have authentication users created yet.

### Create Missing Auth Users:

1. In Supabase Dashboard, click **"Authentication"** in left sidebar
2. Click **"Users"** tab
3. Click **"Add user"** button (top right)
4. Fill in the form:
   - **Email**: (the email from unlinked staff)
   - **Password**: Create a temporary password
     - Example: `TempPass2026!`
   - **✅ Auto Confirm User**: Check this box!
5. Click **"Create user"**
6. Repeat for any other unlinked emails

Then go back to SQL Editor and run `URGENT_FIX_LOGIN.sql` again.

---

## 🎯 Quick Test After Fix

Try logging in with each of these accounts:

| Email | Expected Role | Expected Dashboard |
|-------|---------------|-------------------|
| chairman@amcoms.com | Chairman | Executive Overview |
| manager@amcoms.com | Manager | Operations Dashboard |
| treasurer@amcoms.com | Treasurer | Financial Dashboard |
| bookkeeper@amcoms.com | Bookkeeper | Accounting Dashboard |
| inventory@amcoms.com | Inventory | Inventory Dashboard |
| member@amcoms.com | Member | Member Dashboard |

---

## 🐛 Troubleshooting

### Problem: SQL script shows "permission denied"
**Solution**: Make sure you're logged in as the project owner in Supabase Dashboard.

### Problem: Still can't login after running script
**Check**:
1. Is the account active?
   ```sql
   SELECT email, is_active FROM staff WHERE email = 'your@email.com';
   ```
   Should show `is_active = true`

2. Clear browser cache and try again
3. Try a different browser
4. Check browser console (F12) for specific error messages

### Problem: Script runs but no output shown
**Solution**: 
- Scroll down in the SQL Editor results area
- Results appear below the editor
- Look for tables with headers like "Before Fix", "After Fix", etc.

---

## 📞 Need More Help?

If the fix doesn't work:

1. **Check Browser Console**:
   - Press F12 in your browser
   - Click "Console" tab
   - Take screenshot of any red errors
   - Look for "auth" or "supabase" errors

2. **Check Supabase Logs**:
   - In Supabase Dashboard: Logs → API
   - Look for recent errors
   - Check timestamps match your login attempts

3. **Verify Database Connection**:
   - Check `.env.local` file has correct values:
     ```
     VITE_SUPABASE_URL=https://gfefilzhdbotutiocezz.supabase.co
     VITE_SUPABASE_ANON_KEY=(your key)
     ```

---

## ✨ What This Fix Does

The SQL script:
1. ✅ Finds all staff records without `user_id`
2. ✅ Matches them to auth users by email
3. ✅ Links staff records to auth users
4. ✅ Allows users to log in immediately

**No restart needed!** Changes take effect instantly.

---

## 📊 Expected Timeline

- **Step 1-2** (Open Supabase): 30 seconds
- **Step 3** (Copy script): 15 seconds  
- **Step 4** (Run script): 5 seconds
- **Step 5** (Check results): 10 seconds
- **Step 6** (Test login): 15 seconds

**Total Time**: ~75 seconds (about 1 minute!)

---

**🎉 Once this is done, all users can log in successfully!**

# Login Issue Diagnosis & Fix

## Problem
Users can authenticate with correct email/password but cannot load their staff profile.

## Root Cause
The `staff.user_id` field is likely NULL or not matching `auth.users.id`.

## Diagnosis Steps

### Step 1: Check if staff records exist

Run this in Supabase SQL Editor:

```sql
-- Check staff records
SELECT id, user_id, email, full_name, role, is_active 
FROM public.staff
ORDER BY created_at DESC;
```

**Expected Result:**
- Staff records should exist
- `user_id` might be NULL ❌
- `email` should match login email

### Step 2: Check auth users

```sql
-- Check auth users
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;
```

**Expected Result:**
- Auth users should exist for staff emails
- IDs should match staff.user_id

### Step 3: Check the mismatch

```sql
-- Find staff without user_id
SELECT s.id, s.email, s.full_name, s.role, s.user_id
FROM public.staff s
WHERE s.user_id IS NULL;
```

**If this returns rows:** Staff records exist but aren't linked to auth users.

```sql
-- Find staff with user_id that don't match auth
SELECT s.id, s.email, s.full_name, s.role, s.user_id, u.id as auth_user_id
FROM public.staff s
LEFT JOIN auth.users u ON s.user_id = u.id
WHERE s.user_id IS NOT NULL AND u.id IS NULL;
```

**If this returns rows:** Staff records have invalid user_id references.

---

## Solution 1: Link Existing Staff to Auth Users

If staff records exist but `user_id` is NULL:

```sql
-- Link staff to auth users by email
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND s.user_id IS NULL;

-- Verify the update
SELECT s.email, s.full_name, s.role, s.user_id, u.id as auth_id
FROM public.staff s
JOIN auth.users u ON s.user_id = u.id;
```

---

## Solution 2: Create Auth Users for Existing Staff

If staff records exist but no auth users:

```sql
-- First, check which staff need auth users
SELECT s.email, s.full_name, s.role
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
WHERE u.id IS NULL;
```

**Then create auth users manually:**

You need to use Supabase Dashboard → Authentication → Add User:
- Email: (from staff.email)
- Password: (set a temporary password)
- Auto-confirm: Yes

**After creating users, run Solution 1 to link them.**

---

## Solution 3: Alternative - Match by Email Instead of user_id

If you prefer to match staff by email (temporary workaround), update `AuthContext.jsx`:

```javascript
const fetchStaffProfile = async (userId) => {
  try {
    setAuthError(null);
    
    // Get user email
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      setAuthError('Unable to get user email');
      setStaff(null);
      setLoading(false);
      return null;
    }
    
    // Try to fetch by user_id first
    let { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If not found by user_id, try by email
    if (error && error.code === 'PGRST116') {
      const { data: staffByEmail, error: emailError } = await supabase
        .from('staff')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (emailError) {
        setAuthError('No staff profile found. Please contact the administrator.');
        console.error('Staff profile not found for email:', user.email);
        setStaff(null);
        setLoading(false);
        return null;
      }
      
      data = staffByEmail;
      
      // Update user_id in staff record
      await supabase
        .from('staff')
        .update({ user_id: userId })
        .eq('email', user.email);
    } else if (error) {
      throw error;
    }

    // Validate staff record
    if (!data.is_active) {
      setAuthError('Your account has been deactivated. Please contact the administrator.');
      setStaff(null);
      setLoading(false);
      return null;
    }

    // Validate role
    const validRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member'];
    if (!validRoles.includes(data.role)) {
      setAuthError('Invalid user role. Please contact the administrator.');
      setStaff(null);
      setLoading(false);
      return null;
    }

    setStaff(data);
    setAuthError(null);
    setLoading(false);
    return data;
    
  } catch (error) {
    console.error('Error fetching staff profile:', error.message);
    setAuthError('Failed to load user profile. Please try again.');
    setStaff(null);
    setLoading(false);
    return null;
  }
};
```

---

## Quick Fix Script

Run this comprehensive fix in Supabase SQL Editor:

```sql
-- 1. Link existing staff to auth users by email
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.email = u.email
AND s.user_id IS NULL;

-- 2. Verify the linkage
SELECT 
  s.email,
  s.full_name,
  s.role,
  s.is_active,
  s.user_id,
  u.id as auth_user_id,
  CASE 
    WHEN s.user_id = u.id THEN '✅ Linked'
    WHEN s.user_id IS NULL THEN '❌ No user_id'
    ELSE '⚠️ Mismatch'
  END as status
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
ORDER BY s.email;

-- 3. Show staff that still need fixing
SELECT 
  s.email,
  s.full_name,
  s.role,
  'Need to create auth user' as issue
FROM public.staff s
LEFT JOIN auth.users u ON s.email = u.email
WHERE u.id IS NULL;
```

---

## Testing After Fix

1. Run the SQL fix above
2. Try logging in again
3. Check browser console for errors
4. Verify staff profile loads

---

## Prevention

### When creating new staff:

```sql
-- Option A: Create auth user first, then staff
-- (Done via Supabase Dashboard → Authentication)

-- Then create staff record
INSERT INTO public.staff (user_id, username, email, full_name, role, is_active)
VALUES (
  'auth-user-id-here',
  'username',
  'email@example.com',
  'Full Name',
  'role',
  true
);

-- Option B: Use a trigger to auto-link
CREATE OR REPLACE FUNCTION link_staff_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to find matching auth user
  SELECT id INTO NEW.user_id
  FROM auth.users
  WHERE email = NEW.email
  LIMIT 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_link_staff
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  WHEN (NEW.user_id IS NULL)
  EXECUTE FUNCTION link_staff_to_auth();
```

---

## Check Current Status

Run this to see the current state:

```sql
SELECT 
  COUNT(*) as total_staff,
  COUNT(user_id) as linked_staff,
  COUNT(*) - COUNT(user_id) as unlinked_staff
FROM public.staff;
```

**Expected:**
- total_staff = linked_staff (all staff have user_id)
- unlinked_staff = 0

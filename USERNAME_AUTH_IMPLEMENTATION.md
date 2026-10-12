# Username and Full-Name Authentication

## Overview
Users sign in with a username or a unique full name and password. Supabase Auth continues to use the account email internally after the identifier is resolved; email addresses are not accepted as login identifiers.

## Changes Completed

### 1. Database Migration ✅
**File**: `supabase/migrations/20260928000001_add_username_auth.sql`

- Added `username` column to `staff` table (unique, not null)
- Created index for fast username lookups
- Added username validation function
- Populated existing staff with default usernames (format: firstname.lastname)
- Added check constraint for username format (3-30 chars, alphanumeric with dots/underscores)

**Action Required**: Run this migration in Supabase Dashboard

Also run `supabase/migrations/20261013000001_secure_staff_login_lookup.sql`,
`supabase/migrations/20261013000002_full_name_login_only.sql`, and
`supabase/migrations/20261013000003_staff_names_and_username_login.sql`, and
`supabase/migrations/20261013000004_self_service_username_auth.sql`, and
`supabase/migrations/20261013000005_match_auth_display_name.sql`, in order.
The latest migrations prioritize username lookup, allow unique full-name
lookup against the staff profile and Supabase Auth `full_name`/`display_name`,
and support self-service username changes for staff and members.

### 2. Authentication Helpers ✅
**File**: `src/lib/authHelpers.js`

Created utility functions for:
- `findStaffByLoginIdentifier()` - Resolve a username or full name without exposing staff profiles
- `loginWithIdentifier()` - Resolve the identifier, then authenticate
- `updateUsername()` - Update user's username with validation
- `checkUsernameAvailability()` - Check if username is available

### 3. AuthContext Updates ✅
**File**: `src/contexts/AuthContext.jsx`

- `login()` and `signIn()` resolve the username or full name before authenticating
- Disabled `resetPassword()` - now shows warning message
- Password reset must be done through Chairman's Member Account Recovery

### 4. Login Components Updated ✅
**Files**:
- `src/components/MemberLogin.jsx`
- `src/components/StaffLogin.jsx`

Changes:
- Changed the login identifier field to accept a username or full name
- Removed "Forgot Password" link
- Added info message about contacting staff for password reset
- Using `login()` method from AuthContext

## Changes Still Needed

### 5. Profile Editor Component ✅
**File**: `src/components/common/ProfileEditor.jsx`

- Staff and member profiles include an editable username field.
- Username format and case-insensitive uniqueness are enforced by the profile
  update function and database index.
- Full-name changes update the value used for full-name authentication.

### 6. Member Signup Component
**File**: `src/components/MemberSignup.jsx`

Needs to:
- Remove email verification logic
- Generate default username for new members (or let them choose)
- Update registration flow to work without email confirmation

### 7. Forgot Password Component
**File**: `src/components/ForgotPassword.jsx`

Options:
- Delete this component entirely (recommended)
- Replace with informational page directing users to contact staff

### 8. Member Account Recovery (Chairman)
**File**: `src/components/chairman/MemberAccountRecovery.jsx`

Should already exist, but verify it has:
- Password reset functionality for members
- Option to reset staff passwords (Chairman only)

## Implementation Steps

### Step 1: Run Database Migrations
```sql
-- Execute these files in Supabase Dashboard SQL Editor, in order:
-- supabase/migrations/20260928000001_add_username_auth.sql
-- supabase/migrations/20261013000001_secure_staff_login_lookup.sql
-- supabase/migrations/20261013000002_full_name_login_only.sql
-- supabase/migrations/20261013000003_staff_names_and_username_login.sql
-- supabase/migrations/20261013000004_self_service_username_auth.sql
-- supabase/migrations/20261013000005_match_auth_display_name.sql
```

### Step 2: Confirm Staff Profiles
The latest migration creates or updates staff profiles for the five existing
staff Auth users, sets their names and unique role usernames, and syncs Auth
`full_name` metadata. It does not update Supabase Auth passwords.

### Step 3: Test Login Flow
- Test staff and member login with username
- Test login with a full name that matches one account
- Verify duplicate full names use the distinct username
- Verify email addresses are not accepted as login identifiers
- Verify error messages are clear
- Confirm password reset is disabled

### Step 4: Update Member Signup
- Remove email verification
- Auto-generate or allow username selection
- Test new member registration

### Step 5: Remove/Update Forgot Password
- Delete ForgotPassword component
- Remove routes to forgot-password page
- Update any links pointing to it

## Username and Full-Name Login

Username matching is case-insensitive and takes priority. If no username
matches, the full name must uniquely match `staff.full_name` or the Supabase
Auth user's `full_name`/`display_name` (case-insensitive; spaces are
normalized). Duplicate full names require signing in with username.

## Password Reset Process

### Old Process (Disabled):
1. User clicks "Forgot Password"
2. Enters email
3. Receives reset link via email
4. Clicks link and sets new password

### New Process:
1. User contacts cooperative office
2. Staff member (Chairman has access to Member Account Recovery)
3. Chairman resets password in system
4. User receives new temporary password
5. User logs in and changes password in Settings

## Security Considerations

1. **Login Lookup**: The login function returns only the matching account's email and active status; it does not expose staff profiles.
2. **RLS Policies**: Staff profile reads remain limited by RLS; the security-definer login function handles the pre-authentication lookup.
3. **Password Security**: Unchanged - still using Supabase Auth's secure password hashing
4. **Session Management**: Unchanged - still using JWT tokens

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Staff can log in with username or unique full name
- [ ] Members can log in with username or unique full name
- [ ] Email inputs are rejected as login identifiers
- [ ] Username validation works (format checking)
- [ ] Duplicate username prevention works
- [ ] Users can change their username in profile
- [ ] Usernames remain unique regardless of letter case
- [ ] Users can change their password in profile
- [ ] Login error messages are clear and helpful
- [ ] "Forgot password" links are removed
- [ ] Chairman can reset member passwords
- [ ] New member signup works without email verification

## Rollback Plan

If issues occur:
1. Revert AuthContext changes (restore email-based login)
2. Revert login component changes
3. Keep username field in database (for future use)
4. Re-enable forgot password functionality

## Files Modified

1. ✅ `supabase/migrations/20260928000001_add_username_auth.sql`
2. ✅ `supabase/migrations/20261013000001_secure_staff_login_lookup.sql`
3. ✅ `supabase/migrations/20261013000002_full_name_login_only.sql`
4. ✅ `supabase/migrations/20261013000003_staff_names_and_username_login.sql`
5. ✅ `src/lib/authHelpers.js`
6. ✅ `src/contexts/AuthContext.jsx`
7. ✅ `src/components/Login.jsx`
8. ✅ `src/components/MemberLogin.jsx`
9. ✅ `src/components/StaffLogin.jsx`

## Notes

- Email field is still stored in database (required by Supabase Auth)
- Email is used internally by Supabase Auth after identifier resolution
- Email can still be used for notifications if needed
- Username or unique full name is used as the login identifier

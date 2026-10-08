# Create Authentication Users in Supabase

## The Problem
Your staff records exist in the database, but authentication users don't exist in Supabase's auth system. That's why you get "Invalid email or password" - the auth system doesn't recognize the email.

## The Solution - Create Auth Users Manually

### Step-by-Step:

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your AMCOMS project

2. **Navigate to Authentication**
   - Click **"Authentication"** in left sidebar
   - Click **"Users"** tab

3. **Add Each User**

For each of these emails, click **"Add user"** and fill in:

#### Manager
- Email: `manager@amcoms.com`
- Password: `manager123`
- ✅ **Auto Confirm User** (IMPORTANT!)
- Click "Create user"

#### Chairman
- Email: `chairman@amcoms.com`
- Password: `chairman123`
- ✅ **Auto Confirm User**
- Click "Create user"

#### Treasurer
- Email: `treasurer@amcoms.com`
- Password: `treasurer123`
- ✅ **Auto Confirm User**
- Click "Create user"

#### Bookkeeper
- Email: `bookkeeper@amcoms.com`
- Password: `bookkeeper123`
- ✅ **Auto Confirm User**
- Click "Create user"

#### Inventory
- Email: `inventory@amcoms.com`
- Password: `inventory123`
- ✅ **Auto Confirm User**
- Click "Create user"

#### Member
- Email: `member@amcoms.com`
- Password: `member123`
- ✅ **Auto Confirm User**
- Click "Create user"

4. **After Creating All Users**

Run `URGENT_FIX_LOGIN.sql` in SQL Editor to link them to staff records.

5. **Test Login**

Try logging in with:
- Email: `manager@amcoms.com`
- Password: `manager123`

Should work immediately!

---

## Important Notes

- **Password Requirements**: Supabase requires at least 6 characters
- **Auto Confirm**: You MUST check this box, otherwise users need to confirm email
- **Security**: Users should change these temporary passwords after first login

---

## Alternative - Use Dashboard Bulk Create

Supabase doesn't have bulk user creation in UI, but you can use the API:

```sql
-- This won't work in SQL Editor, but you can try:
-- Supabase only allows creating auth users through Dashboard or API
```

For now, manual creation is fastest for 6 users (takes 3 minutes).

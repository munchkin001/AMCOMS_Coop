-- Create staff table for AMCOMS users
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS staff_username_idx ON public.staff(username);
CREATE INDEX IF NOT EXISTS staff_user_id_idx ON public.staff(user_id);
CREATE INDEX IF NOT EXISTS staff_role_idx ON public.staff(role);
-- Enable Row Level Security
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
-- Create policies
-- Allow users to read their own staff record
DROP POLICY IF EXISTS "Users can view their own staff record" ON public.staff;
CREATE POLICY "Users can view their own staff record"
  ON public.staff
  FOR SELECT
  USING (auth.uid() = user_id);
-- Allow authenticated users to view all staff (for directory purposes)
DROP POLICY IF EXISTS "Authenticated users can view all staff" ON public.staff;
CREATE POLICY "Authenticated users can view all staff"
  ON public.staff
  FOR SELECT
  USING (auth.role() = 'authenticated');
-- Only allow service role to insert/update/delete
DROP POLICY IF EXISTS "Service role can manage staff" ON public.staff;
CREATE POLICY "Service role can manage staff"
  ON public.staff
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.staff;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
-- Insert sample staff members (passwords will be set during auth.users creation)
-- Note: This is just the staff metadata. Actual authentication will be handled by Supabase Auth.
COMMENT ON TABLE public.staff IS 'Staff members and their roles in the AMCOMS system';

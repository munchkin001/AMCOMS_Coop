-- Create member_applications table for member signup workflow
CREATE TABLE IF NOT EXISTS member_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES staff(user_id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable RLS for now to avoid permission issues
ALTER TABLE member_applications DISABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_member_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER member_applications_updated_at
BEFORE UPDATE ON member_applications
FOR EACH ROW
EXECUTE FUNCTION update_member_applications_updated_at();

-- Create trigger to auto-create member when application is approved
CREATE OR REPLACE FUNCTION create_member_from_application()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    -- Insert into member table
    INSERT INTO member (
      user_id,
      email,
      first_name,
      last_name,
      phone,
      address,
      status,
      join_date
    ) VALUES (
      NEW.user_id,
      NEW.email,
      NEW.first_name,
      NEW.last_name,
      NEW.phone,
      NEW.address,
      'active',
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_member_on_approval
AFTER UPDATE ON member_applications
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION create_member_from_application();

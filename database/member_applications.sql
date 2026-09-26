-- Member Applications Table for Signup Approval Workflow
-- This table stores member signup requests that need manager approval

CREATE TABLE IF NOT EXISTS member_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Personal Information
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  
  -- Address
  address TEXT NOT NULL,
  barangay TEXT,
  municipality TEXT,
  province TEXT,
  
  -- Additional Info
  date_of_birth DATE,
  occupation TEXT,
  
  -- Application Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  application_date TIMESTAMP DEFAULT NOW(),
  reviewed_date TIMESTAMP,
  reviewed_by UUID REFERENCES staff(id),
  rejection_reason TEXT,
  
  -- Auth
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_member_applications_email ON member_applications(email);
CREATE INDEX IF NOT EXISTS idx_member_applications_status ON member_applications(status);
CREATE INDEX IF NOT EXISTS idx_member_applications_user_id ON member_applications(user_id);

-- RLS Policies
ALTER TABLE member_applications ENABLE ROW LEVEL SECURITY;

-- Members can view their own application
CREATE POLICY "Members can view own application" ON member_applications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Members can insert their own application
CREATE POLICY "Members can create application" ON member_applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff (manager, chairman) can view all applications
CREATE POLICY "Staff can view all applications" ON member_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- Managers can update applications (approve/reject)
CREATE POLICY "Managers can update applications" ON member_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('manager', 'chairman')
      AND staff.is_active = true
    )
  );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_member_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_member_applications_updated_at
  BEFORE UPDATE ON member_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_member_applications_updated_at();

-- Function to create member record after approval
CREATE OR REPLACE FUNCTION create_member_from_application()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create member if status changed to 'approved'
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    -- Generate member number
    DECLARE
      member_count INTEGER;
      new_member_number TEXT;
    BEGIN
      SELECT COUNT(*) INTO member_count FROM members;
      new_member_number := 'M-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD((member_count + 1)::TEXT, 5, '0');
      
      -- Insert into members table
      INSERT INTO members (
        member_number,
        first_name,
        middle_name,
        last_name,
        email,
        phone,
        address,
        barangay,
        municipality,
        province,
        date_of_birth,
        occupation,
        membership_status,
        membership_date,
        created_at
      ) VALUES (
        new_member_number,
        NEW.first_name,
        NEW.middle_name,
        NEW.last_name,
        NEW.email,
        NEW.phone,
        NEW.address,
        NEW.barangay,
        NEW.municipality,
        NEW.province,
        NEW.date_of_birth,
        NEW.occupation,
        'active',
        CURRENT_DATE,
        NOW()
      );
      
      -- Update staff table to link user_id with member
      INSERT INTO staff (
        user_id,
        email,
        first_name,
        middle_name,
        last_name,
        phone,
        role,
        is_active,
        member_id
      ) VALUES (
        NEW.user_id,
        NEW.email,
        NEW.first_name,
        NEW.middle_name,
        NEW.last_name,
        NEW.phone,
        'member',
        true,
        (SELECT id FROM members WHERE email = NEW.email LIMIT 1)
      );
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_member_on_approval
  AFTER UPDATE ON member_applications
  FOR EACH ROW
  EXECUTE FUNCTION create_member_from_application();

COMMENT ON TABLE member_applications IS 'Stores member signup applications pending manager approval';

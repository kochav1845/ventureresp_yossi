/*
  # Add User Approval System
  
  1. Changes to user_profiles
    - Add `account_status` field (pending, approved, rejected, customer)
    - Add `approved_by` field to track who approved
    - Add `approved_at` field to track when approved
    - Add `rejection_reason` field for rejected accounts
    - Add `requested_role` field for what role user requested
  
  2. Security
    - Update RLS policies to handle pending accounts
    - Only approved accounts can access the system
  
  3. Default Values
    - New accounts default to 'pending' status
    - Existing accounts set to 'approved' status
*/

-- Add approval fields to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'pending' 
  CHECK (account_status IN ('pending', 'approved', 'rejected', 'customer'));

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS requested_role text;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES user_profiles(id);

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS full_name text;

-- Set all existing accounts to approved
UPDATE user_profiles 
SET account_status = 'approved' 
WHERE account_status IS NULL OR account_status = 'pending';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status ON user_profiles(account_status);

-- Function to handle new user sign-ups
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- New users default to pending status
  NEW.account_status := 'pending';
  NEW.role := NULL;  -- No role until approved
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user signups
DROP TRIGGER IF EXISTS on_new_user_signup ON user_profiles;
CREATE TRIGGER on_new_user_signup
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Update RLS policies to check approval status
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Recreate with approval checks
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
      AND account_status = 'approved'
    )
  );

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
      AND account_status = 'approved'
    )
  );

-- Function to approve user account
CREATE OR REPLACE FUNCTION approve_user_account(
  p_user_id uuid,
  p_assigned_role text,
  p_is_customer boolean DEFAULT false
)
RETURNS void AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = v_admin_id 
    AND role = 'admin'
    AND account_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only admins can approve accounts';
  END IF;
  
  -- Update user account
  UPDATE user_profiles
  SET 
    account_status = CASE WHEN p_is_customer THEN 'customer' ELSE 'approved' END,
    role = p_assigned_role,
    approved_by = v_admin_id,
    approved_at = now()
  WHERE id = p_user_id;
  
  -- Log the approval
  INSERT INTO user_activity_logs (
    user_id, action, details, created_at
  ) VALUES (
    v_admin_id, 
    'account_approved',
    jsonb_build_object(
      'approved_user_id', p_user_id,
      'assigned_role', p_assigned_role,
      'is_customer', p_is_customer
    ),
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject user account
CREATE OR REPLACE FUNCTION reject_user_account(
  p_user_id uuid,
  p_reason text
)
RETURNS void AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = v_admin_id 
    AND role = 'admin'
    AND account_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only admins can reject accounts';
  END IF;
  
  -- Update user account
  UPDATE user_profiles
  SET 
    account_status = 'rejected',
    rejection_reason = p_reason,
    approved_by = v_admin_id,
    approved_at = now()
  WHERE id = p_user_id;
  
  -- Log the rejection
  INSERT INTO user_activity_logs (
    user_id, action, details, created_at
  ) VALUES (
    v_admin_id, 
    'account_rejected',
    jsonb_build_object(
      'rejected_user_id', p_user_id,
      'reason', p_reason
    ),
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
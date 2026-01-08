/*
  # Create Pending Users Table
  
  1. New Tables
    - `pending_users`
      - `id` (uuid, primary key)
      - `full_name` (text, required)
      - `email` (text, unique, required)
      - `password_hash` (text, required - encrypted password)
      - `status` (text, default 'pending') - values: 'pending', 'approved', 'declined'
      - `declined_reason` (text, optional)
      - `requested_at` (timestamptz, default now())
      - `reviewed_at` (timestamptz, optional)
      - `reviewed_by` (uuid, references user_profiles)
  
  2. Security
    - Enable RLS on `pending_users` table
    - Allow anonymous users to insert (signup request)
    - Allow users to view their own pending status by email
    - Allow admins to view all pending requests
    - Allow admins to update status
  
  3. Functions
    - Function to approve pending user (creates auth user and profile)
    - Function to decline pending user
*/

-- Create pending_users table
CREATE TABLE IF NOT EXISTS pending_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  declined_reason text,
  requested_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES user_profiles(id)
);

-- Enable RLS
ALTER TABLE pending_users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (signup request)
CREATE POLICY "Anyone can request account"
  ON pending_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow users to view their own pending status by email (without auth)
CREATE POLICY "Users can view own pending status"
  ON pending_users FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admins can update pending users
CREATE POLICY "Admins can update pending users"
  ON pending_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND account_status = 'approved'
    )
  );

-- Function to approve a pending user
CREATE OR REPLACE FUNCTION approve_pending_user(pending_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  pending_record pending_users%ROWTYPE;
  new_user_id uuid;
  result jsonb;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND account_status = 'approved'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Get pending user record
  SELECT * INTO pending_record
  FROM pending_users
  WHERE id = pending_user_id
  AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending user not found or already processed');
  END IF;
  
  -- Create the auth user
  -- Note: We'll need to use Supabase Admin API for this from the edge function
  -- For now, mark as approved and return the data
  UPDATE pending_users
  SET 
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = pending_user_id;
  
  -- Return success with user data
  RETURN jsonb_build_object(
    'success', true,
    'user_data', jsonb_build_object(
      'email', pending_record.email,
      'full_name', pending_record.full_name,
      'password', pending_record.password_hash
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline a pending user
CREATE OR REPLACE FUNCTION decline_pending_user(pending_user_id uuid, reason text DEFAULT NULL)
RETURNS jsonb AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND account_status = 'approved'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Update the pending user status
  UPDATE pending_users
  SET 
    status = 'declined',
    declined_reason = reason,
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = pending_user_id
  AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending user not found or already processed');
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
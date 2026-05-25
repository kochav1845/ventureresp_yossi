/*
  # Add Super Admin Flag and Helper Functions

  1. Changes
    - Add `is_super_admin` column to user_profiles
    - Set a88933513@gmail.com as super admin
    - Create helper functions for org filtering
    - Add RLS policies to organizations table

  2. Security
    - Super admins can manage all organizations
    - Regular users can only see their own organization
*/

-- Add super admin flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_super_admin'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_super_admin boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Set the super admin user
UPDATE user_profiles 
SET is_super_admin = true 
WHERE email = 'a88933513@gmail.com';

-- Helper function: get user's organization_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM user_profiles WHERE id = auth.uid();
$$;

-- Helper function: check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(is_super_admin, false) FROM user_profiles WHERE id = auth.uid();
$$;

-- RLS policies for organizations table
CREATE POLICY "Super admins can do everything with organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
  );

/*
  # Add Granular User Permissions System

  ## Overview
  This migration creates a comprehensive permission system allowing admins to control
  what each user can access in the application.

  ## Changes

  ### 1. Add permissions to user_profiles
  - `permissions` (jsonb) - Stores granular permissions for each user
  
  ### 2. Permission Structure
  Users can have access to specific features:
  - `inbox` - Access email inbox
  - `formulas` - Manage email formulas
  - `templates` - Manage email templates
  - `customers` - View/manage customers
  - `assignments` - Manage customer assignments
  - `schedule` - Manage scheduled tasks
  - `users` - Manage users and permissions (admin only)
  - `dashboard` - View dashboard (default for all)

  ### 3. Default Permissions
  - Admins get all permissions by default
  - Customers get only dashboard and inbox by default
  - Permissions can be customized per user by admins

  ## Security
  - Only admins can modify user permissions
  - Users can read their own permissions
  - RLS policies enforce permission checks
*/

-- Add permissions column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN permissions jsonb DEFAULT '{
      "dashboard": true,
      "inbox": false,
      "formulas": false,
      "templates": false,
      "customers": false,
      "assignments": false,
      "schedule": false,
      "users": false
    }'::jsonb;
  END IF;
END $$;

-- Update existing admin users to have all permissions
UPDATE user_profiles
SET permissions = '{
  "dashboard": true,
  "inbox": true,
  "formulas": true,
  "templates": true,
  "customers": true,
  "assignments": true,
  "schedule": true,
  "users": true
}'::jsonb
WHERE role = 'admin' AND permissions IS NULL;

-- Update existing customer users to have basic permissions
UPDATE user_profiles
SET permissions = '{
  "dashboard": true,
  "inbox": true,
  "formulas": false,
  "templates": false,
  "customers": false,
  "assignments": false,
  "schedule": false,
  "users": false
}'::jsonb
WHERE role = 'customer' AND permissions IS NULL;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  user_id uuid,
  permission_key text
)
RETURNS boolean AS $$
DECLARE
  has_permission boolean;
BEGIN
  SELECT COALESCE((permissions ->> permission_key)::boolean, false)
  INTO has_permission
  FROM user_profiles
  WHERE id = user_id;
  
  RETURN COALESCE(has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION user_has_permission(uuid, text) TO authenticated;

-- Update the handle_new_user function to set default permissions
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role text;
  user_permissions jsonb;
BEGIN
  -- Determine role and permissions
  IF NEW.email = 'a88933513@gmail.com' THEN
    user_role := 'admin';
    user_permissions := '{
      "dashboard": true,
      "inbox": true,
      "formulas": true,
      "templates": true,
      "customers": true,
      "assignments": true,
      "schedule": true,
      "users": true
    }'::jsonb;
  ELSE
    user_role := 'customer';
    user_permissions := '{
      "dashboard": true,
      "inbox": true,
      "formulas": false,
      "templates": false,
      "customers": false,
      "assignments": false,
      "schedule": false,
      "users": false
    }'::jsonb;
  END IF;

  INSERT INTO public.user_profiles (id, email, role, permissions)
  VALUES (NEW.id, NEW.email, user_role, user_permissions);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Admins can update user permissions
CREATE POLICY "Admins can update user permissions"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
      AND (up.permissions ->> 'users')::boolean = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
      AND (up.permissions ->> 'users')::boolean = true
    )
  );

-- Create view for user management (admins only)
CREATE OR REPLACE VIEW admin_user_list AS
SELECT 
  id,
  email,
  role,
  permissions,
  created_at,
  updated_at
FROM user_profiles
WHERE EXISTS (
  SELECT 1 FROM user_profiles
  WHERE user_profiles.id = auth.uid()
  AND user_profiles.role = 'admin'
  AND (user_profiles.permissions ->> 'users')::boolean = true
);

-- Grant select on view to authenticated users
GRANT SELECT ON admin_user_list TO authenticated;

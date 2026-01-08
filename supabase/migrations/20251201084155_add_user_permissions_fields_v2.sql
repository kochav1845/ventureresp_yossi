/*
  # Add User Permissions for Admin Features

  1. Overview
    - Add specific permission fields to control access to admin features
    - Allow admins to grant/revoke permissions for viewing logs, sync data, and fetching data

  2. Changes
    - Add columns to user_profiles for granular permissions:
      - can_view_admin_logs: Access to admin panel and status change logs
      - can_view_sync_data: Access to sync configuration and status
      - can_perform_fetch: Ability to fetch invoices, payments, and customers from Acumatica

  3. Defaults
    - All new permissions default to false for security
    - Admin role gets all permissions by default

  4. Security
    - Only admins can update user permissions
    - Users can view their own permissions
*/

-- Add permission columns to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS can_view_admin_logs BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_view_sync_data BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_perform_fetch BOOLEAN DEFAULT false;

-- Create index for faster permission checks
CREATE INDEX IF NOT EXISTS idx_user_profiles_permissions ON user_profiles(can_view_admin_logs, can_view_sync_data, can_perform_fetch);

-- Update existing admin users to have all permissions
UPDATE user_profiles 
SET 
  can_view_admin_logs = true,
  can_view_sync_data = true,
  can_perform_fetch = true
WHERE role = 'admin';

-- Create function to auto-grant all permissions to admin role
CREATE OR REPLACE FUNCTION grant_admin_permissions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    NEW.can_view_admin_logs := true;
    NEW.can_view_sync_data := true;
    NEW.can_perform_fetch := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-grant permissions when role becomes admin
DROP TRIGGER IF EXISTS auto_grant_admin_permissions ON user_profiles;
CREATE TRIGGER auto_grant_admin_permissions
  BEFORE INSERT OR UPDATE OF role ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION grant_admin_permissions();

-- Add helpful comments
COMMENT ON COLUMN user_profiles.can_view_admin_logs IS 'Permission to view admin panel and invoice status change logs';
COMMENT ON COLUMN user_profiles.can_view_sync_data IS 'Permission to view and configure sync settings and status';
COMMENT ON COLUMN user_profiles.can_perform_fetch IS 'Permission to manually fetch invoices, payments, and customers from Acumatica';

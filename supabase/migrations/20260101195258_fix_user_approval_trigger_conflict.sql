/*
  # Fix User Approval Trigger Conflict
  
  1. Problem
    - The handle_new_user() trigger auto-creates profiles with role
    - The handle_new_user_signup() trigger sets role = NULL
    - This conflicts because role is NOT NULL
    - Causes error when approving users from pending_users
  
  2. Solution
    - Modify handle_new_user_signup() to set a default role instead of NULL
    - Make role column nullable to support pending users
    - Or better: modify the trigger to only apply to non-approved users
  
  3. Changes
    - Drop the conflicting trigger
    - Create a new trigger that handles both scenarios
    - Update edge function workflow
*/

-- Drop the conflicting triggers
DROP TRIGGER IF EXISTS on_new_user_signup ON user_profiles;
DROP FUNCTION IF EXISTS handle_new_user_signup();

-- Update the handle_new_user function to work with approval system
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this user is being created by the approval system
  -- by checking if they exist in pending_users with status 'approved'
  IF EXISTS (
    SELECT 1 FROM pending_users 
    WHERE email = NEW.email 
    AND status = 'approved'
  ) THEN
    -- User is being created from approval - insert with customer role by default
    INSERT INTO public.user_profiles (id, email, role, account_status, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      'customer',  -- Default role for approved users
      'approved',
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
  ELSE
    -- Regular signup (legacy path) - check if admin email
    INSERT INTO public.user_profiles (id, email, role, account_status)
    VALUES (
      NEW.id,
      NEW.email,
      CASE 
        WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
        ELSE 'customer'
      END,
      'approved'  -- Auto-approve for backwards compatibility
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is in place
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
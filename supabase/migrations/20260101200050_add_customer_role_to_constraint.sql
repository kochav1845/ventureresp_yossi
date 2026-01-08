/*
  # Add Customer Role to Role Constraint
  
  1. Problem
    - user_profiles role constraint doesn't include 'customer'
    - Trigger tries to set role to 'customer' for approved users
    - This causes constraint violation
  
  2. Solution
    - Update the role check constraint to include 'customer'
    - Or change the trigger to use 'user' instead
    - Using 'user' is cleaner since it's already in the constraint
*/

-- Option 1: Add 'customer' to allowed roles
ALTER TABLE user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('admin', 'developer', 'user', 'secretary', 'collector', 'manager', 'viewer', 'customer'));

-- Update the trigger to use 'user' role for regular users (more standard)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
  v_account_status text;
  v_full_name text;
  v_is_approved boolean;
BEGIN
  RAISE LOG 'handle_new_user trigger fired for email: %', NEW.email;
  
  -- Check if this user is being approved from pending (via metadata)
  v_is_approved := COALESCE((NEW.raw_user_meta_data->>'approved_from_pending')::boolean, false);
  
  IF v_is_approved THEN
    RAISE LOG 'User % is being approved from pending_users (via metadata)', NEW.email;
    v_role := 'user';  -- Use 'user' role for approved users
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  ELSE
    RAISE LOG 'User % is regular signup', NEW.email;
    -- Regular signup - check if admin email
    v_role := CASE 
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
      ELSE 'user'  -- Use 'user' as default role
    END;
    v_account_status := 'approved';
    v_full_name := NULL;
  END IF;
  
  -- Insert or update user profile with conflict handling
  INSERT INTO public.user_profiles (id, email, role, account_status, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_account_status,
    v_full_name
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    account_status = EXCLUDED.account_status,
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    updated_at = now();
  
  RAISE LOG 'Successfully created/updated user_profile for %', NEW.email;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user trigger for email %: % %', NEW.email, SQLSTATE, SQLERRM;
    -- Re-raise to fail the auth user creation
    RAISE;
END;
$$;
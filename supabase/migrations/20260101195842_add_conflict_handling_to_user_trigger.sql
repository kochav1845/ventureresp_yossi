/*
  # Add Conflict Handling to User Creation Trigger
  
  1. Problem
    - If user_profile insert fails, entire auth user creation fails
    - Need ON CONFLICT handling
    - Need better error logging
  
  2. Solution
    - Add ON CONFLICT DO UPDATE to handle edge cases
    - Add detailed error logging
    - Make trigger more resilient
*/

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
BEGIN
  RAISE LOG 'handle_new_user trigger fired for email: %', NEW.email;
  
  -- Check if this user is being created by the approval system
  IF EXISTS (
    SELECT 1 FROM public.pending_users 
    WHERE email = NEW.email 
    AND status = 'approved'
  ) THEN
    RAISE LOG 'User % is being approved from pending_users', NEW.email;
    v_role := 'customer';
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  ELSE
    RAISE LOG 'User % is regular signup', NEW.email;
    -- Regular signup - check if admin email
    v_role := CASE 
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
      ELSE 'customer'
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
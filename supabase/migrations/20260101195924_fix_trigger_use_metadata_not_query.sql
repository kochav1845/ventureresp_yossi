/*
  # Fix Trigger to Use Metadata Instead of Querying
  
  1. Problem
    - Trigger can't access pending_users due to RLS restrictions
    - Even with SECURITY DEFINER, RLS is enforced
    - Need a different approach
  
  2. Solution
    - Edge function passes 'approved_from_pending' flag in user_metadata
    - Trigger reads from metadata instead of querying database
    - Simpler and more reliable
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
  v_is_approved boolean;
BEGIN
  RAISE LOG 'handle_new_user trigger fired for email: %', NEW.email;
  
  -- Check if this user is being approved from pending (via metadata)
  v_is_approved := COALESCE((NEW.raw_user_meta_data->>'approved_from_pending')::boolean, false);
  
  IF v_is_approved THEN
    RAISE LOG 'User % is being approved from pending_users (via metadata)', NEW.email;
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
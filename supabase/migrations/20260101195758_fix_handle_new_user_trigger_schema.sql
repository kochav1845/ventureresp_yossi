/*
  # Fix handle_new_user Trigger Schema Reference
  
  1. Problem
    - Trigger function references pending_users without schema qualification
    - Can cause access issues with SECURITY DEFINER
    - Need to explicitly use public.pending_users
  
  2. Solution
    - Update function to use fully qualified table names
    - Set explicit search_path for security
    - Add better error handling
*/

-- Fix the handle_new_user function with proper schema qualification
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if this user is being created by the approval system
  -- by checking if they exist in pending_users with status 'approved'
  IF EXISTS (
    SELECT 1 FROM public.pending_users 
    WHERE email = NEW.email 
    AND status = 'approved'
  ) THEN
    -- User is being created from approval - insert with customer role by default
    INSERT INTO public.user_profiles (id, email, role, account_status, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      'customer',
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
      'approved'
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RAISE;
END;
$$;

-- Ensure the trigger is in place
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
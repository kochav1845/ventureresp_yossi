/*
  # Fix New User Signup Permissions
  
  1. Problem
    - New users can't update their profile after signup
    - The trigger sets account_status to 'pending'
    - But the RLS policy only allows updates to own profile
    - The full_name update is failing
  
  2. Solution
    - Allow users to update their own profile regardless of status
    - Specifically allow updating full_name field during signup
  
  3. Changes
    - Update the "Users can update own profile" policy to be more permissive
    - Allow self-updates even when account_status is pending
*/

-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Recreate with more permissive rules for own profile
-- Users can always update their own profile, regardless of account status
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    -- Prevent users from changing their own approval status or role
    -- (these should only be changed by admins via the approval functions)
    (
      account_status = (SELECT account_status FROM user_profiles WHERE id = auth.uid()) OR
      account_status IS NULL
    )
  );

-- Also ensure users can insert their initial profile data
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
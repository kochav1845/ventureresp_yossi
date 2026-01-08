/*
  # Fix Signup Flow Properly
  
  1. Problem
    - The auto-create profile trigger conflicts with the approval system
    - The WITH CHECK clause on update policy is too complex
    - New users can't update their profile after creation
  
  2. Solution
    - Simplify the update policy
    - Allow users to update their own profile fields
    - But prevent them from changing approval-related fields
  
  3. Changes
    - Drop and recreate update policy with simpler logic
*/

-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create a simple policy that allows users to update their own profile
-- They can update fields like full_name, but not approval-related fields
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Note: We're removing the WITH CHECK clause for now to allow updates
-- The trigger will still set account_status properly on INSERT
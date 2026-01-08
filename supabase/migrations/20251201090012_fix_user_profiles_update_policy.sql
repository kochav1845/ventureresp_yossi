/*
  # Fix User Profiles Update Policy

  1. Overview
    - Remove conflicting "Admins can update user permissions" policy
    - The existing "Admins can update profiles" policy is sufficient

  2. Changes
    - Drop the redundant policy that checks for permissions.users field
    - This field doesn't exist and was causing update failures

  3. Result
    - Admins can now update all user profiles using the is_admin() function
*/

-- Drop the conflicting policy
DROP POLICY IF EXISTS "Admins can update user permissions" ON user_profiles;

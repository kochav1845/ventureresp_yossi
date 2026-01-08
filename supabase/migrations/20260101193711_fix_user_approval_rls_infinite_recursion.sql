/*
  # Fix RLS Infinite Recursion in User Approval System
  
  1. Problem
    - The RLS policies created a recursive check on user_profiles
    - When checking if a user is admin, it queries user_profiles again
    - This causes infinite recursion
  
  2. Solution
    - Simplify the policies to avoid self-reference
    - Use direct auth.uid() checks only
    - Create helper function with SECURITY DEFINER to bypass RLS
  
  3. Changes
    - Drop problematic policies
    - Create simpler, non-recursive policies
    - Add security definer function for admin checks
*/

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create simple, non-recursive policy for viewing own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Create simple policy for updating own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins need to be able to view all profiles for the approval panel
-- Create a security definer function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND account_status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin());

-- Create policy for admins to update any profile
CREATE POLICY "Admins can update any profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin());

-- Managers can also view profiles but not update
CREATE OR REPLACE FUNCTION is_manager_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager')
    AND account_status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Managers can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_manager_or_admin());
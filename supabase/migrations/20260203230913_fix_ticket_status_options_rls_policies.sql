/*
  # Fix Ticket Status Options RLS Policies
  
  1. Changes
    - Drop existing RLS policies
    - Create new policies that properly check admin permissions
    - Allow all authenticated users to view active statuses
    - Allow admins and managers to manage statuses
  
  2. Security
    - Uses simplified role checks from user_profiles
    - Ensures proper access control for ticket status management
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view active ticket statuses" ON ticket_status_options;
DROP POLICY IF EXISTS "Admins can insert ticket statuses" ON ticket_status_options;
DROP POLICY IF EXISTS "Admins can update ticket statuses" ON ticket_status_options;
DROP POLICY IF EXISTS "Admins can delete non-system ticket statuses" ON ticket_status_options;

-- Allow all authenticated users to view active statuses
CREATE POLICY "Anyone can view active ticket statuses"
  ON ticket_status_options
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Allow admins and managers to insert new statuses
CREATE POLICY "Admins and managers can insert ticket statuses"
  ON ticket_status_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Allow admins and managers to update statuses
CREATE POLICY "Admins and managers can update ticket statuses"
  ON ticket_status_options
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Allow admins and managers to delete non-system statuses
CREATE POLICY "Admins and managers can delete non-system ticket statuses"
  ON ticket_status_options
  FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );
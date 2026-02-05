/*
  # Fix Ticket Type Options RLS for Admin Management

  1. Changes
    - Add policy for admins to view ALL ticket types (including inactive)
    - This allows the Ticket Type Management page to display all types for editing

  2. Security
    - Regular users can only see active types
    - Admins and managers can see all types for management purposes
*/

-- Add policy for admins to view all ticket types (including inactive)
CREATE POLICY "Admins can read all ticket types"
  ON ticket_type_options
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

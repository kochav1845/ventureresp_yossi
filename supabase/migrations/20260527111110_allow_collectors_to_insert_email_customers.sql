/*
  # Allow collectors to insert email customers

  1. Changes
    - Adds INSERT policy on `customers` table for collectors and managers
    - This allows collectors to create email assignment customers from tickets

  2. Security
    - Only authenticated collectors, managers, and admins can insert
*/

CREATE POLICY "Collectors can insert customers"
  ON customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('collector', 'manager', 'admin')
    )
  );

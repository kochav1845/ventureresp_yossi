/*
  # Allow collectors to update customers

  1. Security Changes
    - Add UPDATE policy on `customers` table for collectors
    - Collectors need to toggle `responded_this_month` and other customer fields
    - Add SELECT policy so collectors can view customers they work with

  2. Important Notes
    - Previously only admins could update customers, causing silent failures for collectors
*/

CREATE POLICY "Collectors can update customers"
  ON customers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('collector', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('collector', 'admin', 'manager')
    )
  );

CREATE POLICY "Collectors can view customers"
  ON customers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('collector', 'manager')
    )
  );

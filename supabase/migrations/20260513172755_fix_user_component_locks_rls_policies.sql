/*
  # Fix RLS Policies for user_component_locks

  1. Changes
    - Replace the `FOR ALL` admin policy with separate SELECT/INSERT/UPDATE/DELETE policies
    - This fixes potential RLS policy evaluation issues
  
  2. Security
    - Admins can read, create, update, and delete all locks
    - Non-admin users can only read their own locks
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all component locks" ON user_component_locks;
  DROP POLICY IF EXISTS "Users can view own component locks" ON user_component_locks;
END $$;

CREATE POLICY "Admins can select all component locks"
  ON user_component_locks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert component locks"
  ON user_component_locks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update component locks"
  ON user_component_locks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete component locks"
  ON user_component_locks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own component locks"
  ON user_component_locks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

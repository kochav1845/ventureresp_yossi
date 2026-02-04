/*
  # Make user_id nullable in user_activity_logs

  1. Changes
    - Alter user_id column to allow NULL values
    - Update RLS policies to handle system-generated logs (where user_id is NULL)
    - System processes (like syncs) can create activity logs without a user

  2. Security
    - Update existing policies to handle NULL user_id
    - Add policy for service role to insert system logs
*/

-- Make user_id nullable for system-generated logs
ALTER TABLE user_activity_logs
ALTER COLUMN user_id DROP NOT NULL;

-- Update the insert policy to allow NULL user_id for service role
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON user_activity_logs;

CREATE POLICY "Authenticated users can insert activity logs"
  ON user_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR 
    auth.jwt()->>'role' = 'service_role'
  );

-- Allow service role to insert system logs
CREATE POLICY "Service role can insert system activity logs"
  ON user_activity_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Update select policies to include system logs
DROP POLICY IF EXISTS "Admins can view all activity logs" ON user_activity_logs;

CREATE POLICY "Admins can view all activity logs"
  ON user_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

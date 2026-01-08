/*
  # Create User Activity Logs System

  1. New Tables
    - `user_activity_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `action_type` (text) - Type of action performed
      - `entity_type` (text) - Type of entity affected (invoice, customer, payment, etc.)
      - `entity_id` (text) - ID of the affected entity
      - `details` (jsonb) - Additional details about the action
      - `ip_address` (text, optional) - IP address of the user
      - `created_at` (timestamptz) - When the action occurred

  2. Security
    - Enable RLS on `user_activity_logs` table
    - Admins can view all activity logs
    - Users can view their own activity logs

  3. Indexes
    - Index on user_id for fast lookups
    - Index on entity_type and entity_id for filtering
    - Index on created_at for sorting
*/

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON user_activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON user_activity_logs(action_type);

ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can view their own activity logs"
  ON user_activity_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert activity logs"
  ON user_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to log activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_action_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO user_activity_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    auth.uid(),
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_details
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
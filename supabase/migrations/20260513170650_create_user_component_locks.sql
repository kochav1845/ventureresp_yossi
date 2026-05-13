/*
  # Simplified Component Lock System

  Replaces the complex 21-permission RBAC system with a simple
  locked/unlocked model for 5 specific components. Everything
  else is accessible by default.

  1. New Tables
    - `user_component_locks`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `component_key` (text) - one of: settings, email_system, developer_settings, invoice_analytics, payment_analytics
      - `is_locked` (boolean, default true)
      - `updated_by` (uuid) - admin who set the lock
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - Admins can read/write all locks
    - Users can read their own locks

  3. Notes
    - Admins always bypass locks
    - Only these 5 areas can be locked; everything else is open
*/

CREATE TABLE IF NOT EXISTS user_component_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  is_locked boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, component_key),
  CONSTRAINT valid_component_key CHECK (
    component_key IN ('settings', 'email_system', 'developer_settings', 'invoice_analytics', 'payment_analytics')
  )
);

ALTER TABLE user_component_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all component locks"
  ON user_component_locks
  FOR ALL
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

CREATE POLICY "Users can view own component locks"
  ON user_component_locks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_user_component_locks_user_id ON user_component_locks(user_id);

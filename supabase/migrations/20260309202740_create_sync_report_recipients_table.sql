/*
  # Create Sync Report Recipients Table

  1. New Tables
    - `sync_report_recipients`
      - `id` (uuid, primary key)
      - `email` (text, required) - recipient email address
      - `name` (text) - display name for the recipient
      - `is_active` (boolean, default true) - whether to send reports to this recipient
      - `created_at` (timestamptz)
      - `created_by` (uuid, references auth.users)

  2. Security
    - RLS enabled
    - Only authenticated admins/managers can manage recipients
*/

CREATE TABLE IF NOT EXISTS sync_report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE sync_report_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync report recipients"
  ON sync_report_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can insert sync report recipients"
  ON sync_report_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can update sync report recipients"
  ON sync_report_recipients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete sync report recipients"
  ON sync_report_recipients
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'manager')
    )
  );
/*
  # Create Department Email Senders

  Adds per-department sender address configuration so different types
  of emails (AR invoices, census, tickets, reminders, system) can each
  use their own "from" address and reply-to address.

  1. New Tables
    - `department_email_senders`
      - `id` (uuid, primary key)
      - `department_key` (text, unique) - machine-readable key like 'ar', 'census', 'tickets'
      - `department_label` (text) - human-readable label like 'Accounts Receivable'
      - `from_email` (text) - sender email for this department
      - `from_name` (text) - sender display name
      - `reply_to_email` (text) - reply-to email (optional, falls back to from_email)
      - `reply_to_name` (text) - reply-to display name
      - `is_active` (boolean) - whether this department sender is active
      - `description` (text) - explains what this department is used for
      - `created_at` / `updated_at` (timestamptz)

  2. Seed Data
    - Pre-populates with 5 departments: ar, census, tickets, reminders, noreply

  3. Security
    - RLS enabled
    - Authenticated users can read
    - Admins can insert, update, delete
*/

CREATE TABLE IF NOT EXISTS department_email_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_key text UNIQUE NOT NULL,
  department_label text NOT NULL,
  from_email text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  reply_to_email text NOT NULL DEFAULT '',
  reply_to_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE department_email_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read department senders"
  ON department_email_senders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert department senders"
  ON department_email_senders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update department senders"
  ON department_email_senders
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

CREATE POLICY "Admins can delete department senders"
  ON department_email_senders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role full access to department senders"
  ON department_email_senders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_department_senders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_department_senders_updated_at
  BEFORE UPDATE ON department_email_senders
  FOR EACH ROW
  EXECUTE FUNCTION update_department_senders_updated_at();

INSERT INTO department_email_senders (department_key, department_label, from_email, from_name, reply_to_email, reply_to_name, is_active, description)
VALUES
  ('ar', 'Accounts Receivable', '', '', '', '', true, 'Used for customer invoice statements, payment reminders, and AR correspondence'),
  ('census', 'Census', '', '', '', '', true, 'Used for monthly census requests and census-related communications'),
  ('tickets', 'Collection Tickets', '', '', '', '', true, 'Used for collection ticket notifications and follow-ups'),
  ('reminders', 'Reminders', '', '', '', '', true, 'Used for internal reminder notifications sent to staff'),
  ('noreply', 'System / No-Reply', '', '', '', '', true, 'Used for system emails like password resets and account notifications')
ON CONFLICT (department_key) DO NOTHING;

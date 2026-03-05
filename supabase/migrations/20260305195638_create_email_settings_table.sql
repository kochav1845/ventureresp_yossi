/*
  # Create Email Settings Table

  1. New Tables
    - `email_settings`
      - `id` (uuid, primary key)
      - `ar_from_email` (text) - AR department sender email
      - `ar_from_name` (text) - AR department sender display name
      - `noreply_from_email` (text) - No-reply sender email for system emails
      - `noreply_from_name` (text) - No-reply sender display name
      - `reply_to_email` (text) - Reply-to email address
      - `reply_to_name` (text) - Reply-to display name
      - `company_name` (text) - Company name used in emails
      - `domain` (text) - Primary email domain
      - `inbound_parse_subdomain` (text) - Subdomain for inbound parse (optional)
      - `sendgrid_tracking_clicks` (boolean) - Enable click tracking
      - `sendgrid_tracking_opens` (boolean) - Enable open tracking
      - `updated_by` (uuid) - Last user who updated settings
      - `updated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `email_settings` table
    - Admin users can read and update settings
    - Authenticated users can read settings

  3. Notes
    - Single-row table (only one set of settings)
    - Seeded with current default values from ventureresp.app
*/

CREATE TABLE IF NOT EXISTS email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_from_email text NOT NULL DEFAULT 'ar@ventureresp.app',
  ar_from_name text NOT NULL DEFAULT 'Venture Respiratory - Accounts Receivable',
  noreply_from_email text NOT NULL DEFAULT 'noreply@ventureresp.app',
  noreply_from_name text NOT NULL DEFAULT 'Venture Respiratory Admin',
  reply_to_email text NOT NULL DEFAULT 'ar@ventureresp.app',
  reply_to_name text NOT NULL DEFAULT 'Venture Respiratory - Accounts Receivable',
  company_name text NOT NULL DEFAULT 'Venture Respiratory',
  domain text NOT NULL DEFAULT 'ventureresp.app',
  inbound_parse_subdomain text DEFAULT '',
  sendgrid_tracking_clicks boolean NOT NULL DEFAULT true,
  sendgrid_tracking_opens boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read email settings"
  ON email_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update email settings"
  ON email_settings
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

CREATE POLICY "Admins can insert email settings"
  ON email_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

INSERT INTO email_settings (
  ar_from_email,
  ar_from_name,
  noreply_from_email,
  noreply_from_name,
  reply_to_email,
  reply_to_name,
  company_name,
  domain,
  sendgrid_tracking_clicks,
  sendgrid_tracking_opens
) VALUES (
  'ar@ventureresp.app',
  'Venture Respiratory - Accounts Receivable',
  'noreply@ventureresp.app',
  'Venture Respiratory Admin',
  'ar@ventureresp.app',
  'Venture Respiratory - Accounts Receivable',
  'Venture Respiratory',
  'ventureresp.app',
  true,
  true
);
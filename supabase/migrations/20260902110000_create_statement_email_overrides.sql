/*
  # Statement Email Overrides

  A manually-entered email per customer that overrides the email synced from
  Acumatica when sending statements (manual and automatic). Also lets users
  add an email for customers that have none on file.

  1. New Tables
    - `statement_email_overrides`
      - `customer_id` (text, unique) - Acumatica customer id
      - `email` (text) - The address statements should go to
      - `organization_id` (uuid, nullable) - for future org scoping
      - `created_by` (uuid, fk user_profiles)
      - `created_at` / `updated_at` (timestamptz)

  2. Security
    - RLS enabled: all authenticated users can read and manage
      (collectors need to correct emails without admin help).
*/

CREATE TABLE IF NOT EXISTS statement_email_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL UNIQUE,
  email text NOT NULL,
  organization_id uuid,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statement_email_overrides_customer
  ON statement_email_overrides(customer_id);

ALTER TABLE statement_email_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage statement email overrides" ON statement_email_overrides;
CREATE POLICY "Authenticated users can manage statement email overrides"
  ON statement_email_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_statement_email_override_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_statement_email_override_timestamp ON statement_email_overrides;
CREATE TRIGGER trigger_update_statement_email_override_timestamp
  BEFORE UPDATE ON statement_email_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_statement_email_override_timestamp();

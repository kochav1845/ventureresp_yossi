/*
  # Create Statement Auto-Send Rules System

  1. New Tables
    - `statement_auto_send_rules`
      - `id` (uuid, primary key)
      - `name` (text) - Rule name for display
      - `customer_ids` (text[]) - Array of customer IDs to send to
      - `day_of_month` (integer) - Day of month to send (1-31)
      - `time_of_day` (text) - Time to send (e.g., '09:00')
      - `template_id` (uuid, FK) - Report template to use
      - `is_active` (boolean) - Whether rule is active
      - `last_sent_at` (timestamptz) - Last time this rule triggered
      - `created_by` (uuid) - User who created the rule
      - `organization_id` (uuid) - Org isolation
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Policies for authenticated users within same org
*/

CREATE TABLE IF NOT EXISTS statement_auto_send_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  customer_ids text[] NOT NULL DEFAULT '{}',
  day_of_month integer NOT NULL DEFAULT 1 CHECK (day_of_month >= 1 AND day_of_month <= 31),
  time_of_day text NOT NULL DEFAULT '09:00',
  template_id uuid REFERENCES customer_report_templates(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE statement_auto_send_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view statement rules in their org"
  ON statement_auto_send_rules FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert statement rules"
  ON statement_auto_send_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update statement rules in their org"
  ON statement_auto_send_rules FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete statement rules in their org"
  ON statement_auto_send_rules FOR DELETE
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE TRIGGER update_statement_auto_send_rules_updated_at
  BEFORE UPDATE ON statement_auto_send_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

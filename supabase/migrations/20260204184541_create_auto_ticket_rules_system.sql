/*
  # Create Auto-Ticket Rules System

  1. New Table
    - `auto_ticket_rules`
      - `id` (uuid, primary key)
      - `customer_id` (text, unique) - Acumatica customer ID
      - `min_days_old` (integer) - Minimum age of invoices (e.g., 120)
      - `max_days_old` (integer) - Maximum age of invoices (e.g., 150)
      - `assigned_collector_id` (uuid) - User to assign tickets to
      - `created_by` (uuid) - Admin who created the rule
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `active` (boolean) - Enable/disable rule without deleting

  2. Security
    - Enable RLS on `auto_ticket_rules` table
    - Only admins and managers can manage rules
    - Collectors can view rules assigned to them

  3. Indexes
    - Index on customer_id for quick lookups
    - Index on assigned_collector_id for filtering
    - Index on active for cron job filtering
*/

CREATE TABLE IF NOT EXISTS auto_ticket_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL UNIQUE,
  min_days_old integer NOT NULL CHECK (min_days_old >= 0),
  max_days_old integer NOT NULL CHECK (max_days_old > min_days_old),
  assigned_collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  CONSTRAINT valid_day_range CHECK (max_days_old > min_days_old)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_auto_ticket_rules_customer_id ON auto_ticket_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_auto_ticket_rules_collector ON auto_ticket_rules(assigned_collector_id);
CREATE INDEX IF NOT EXISTS idx_auto_ticket_rules_active ON auto_ticket_rules(active) WHERE active = true;

-- Enable RLS
ALTER TABLE auto_ticket_rules ENABLE ROW LEVEL SECURITY;

-- Admins and managers can do everything
CREATE POLICY "Admins and managers can manage auto-ticket rules"
  ON auto_ticket_rules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Collectors can view rules assigned to them
CREATE POLICY "Collectors can view their assigned rules"
  ON auto_ticket_rules
  FOR SELECT
  TO authenticated
  USING (assigned_collector_id = auth.uid());

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_auto_ticket_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_auto_ticket_rules_updated_at
  BEFORE UPDATE ON auto_ticket_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_ticket_rules_updated_at();

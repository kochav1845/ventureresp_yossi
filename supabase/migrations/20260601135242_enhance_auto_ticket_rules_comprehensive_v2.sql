/*
  # Comprehensive Auto-Ticket Rules Enhancement

  1. New Table: `auto_ticket_rule_conditions`
    - `id` (uuid, primary key)
    - `rule_id` (uuid, FK to auto_ticket_rules)
    - `condition_type` (text) - Type of condition check
    - `operator` (text) - Comparison operator (gt, lt, gte, lte, eq, between)
    - `value_numeric` (numeric) - Numeric threshold value
    - `value_numeric_max` (numeric) - Upper bound for "between" operator
    - `value_text` (text) - Text value for certain conditions
    - `time_unit` (text) - days, months, weeks
    - `created_at` (timestamptz)

  2. New Table: `auto_ticket_rule_targets`
    - `id` (uuid, primary key)
    - `rule_id` (uuid, FK to auto_ticket_rules)
    - `target_type` (text) - 'all_customers', 'specific_customers', 'exclude_customers'
    - `customer_id` (text, nullable) - Specific customer for include/exclude

  3. Modifications to `auto_ticket_rules`
    - `rule_name` (text) - User-friendly name for the rule
    - `description` (text) - Description of what this rule does
    - `action_type` (text) - 'ticket_only', 'email_only', 'ticket_and_email', 'reminder_only'
    - `email_recipients` (text[]) - List of email addresses to notify
    - `notify_admin` (boolean) - Whether to send email to admin
    - `priority` (text) - Ticket priority: low, medium, high, urgent
    - `ticket_type_id` (uuid) - FK to ticket_type_options
    - `logic_operator` (text) - 'AND' or 'OR' for combining conditions
    - `applies_to` (text) - 'all', 'specific', 'exclude' target scope

  4. Condition Types Supported:
    - balance_threshold: Customer total balance exceeds threshold
    - invoice_count_overdue: Number of invoices past due date
    - invoice_age_days: Invoice age from due date or creation date
    - payment_pattern_deviation: Deviation from normal payment pattern
    - payment_amount_drop: Monthly payment amount dropped below threshold
    - days_since_last_payment: Days since customer last paid
    - invoice_amount_threshold: Individual invoice amount exceeds value
    - overdue_percentage: Percentage of invoices overdue

  5. Security
    - Enable RLS on new tables
    - Admins/managers can manage
    - Collectors can view assigned rules
*/

-- Add new columns to auto_ticket_rules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'rule_name'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN rule_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'description'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'action_type'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN action_type text DEFAULT 'ticket_only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'email_recipients'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN email_recipients text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'notify_admin'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN notify_admin boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'priority'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN priority text DEFAULT 'medium';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'ticket_type_id'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN ticket_type_id uuid REFERENCES ticket_type_options(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'logic_operator'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN logic_operator text DEFAULT 'AND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'applies_to'
  ) THEN
    ALTER TABLE auto_ticket_rules ADD COLUMN applies_to text DEFAULT 'specific';
  END IF;
END $$;

-- Create conditions table
CREATE TABLE IF NOT EXISTS auto_ticket_rule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES auto_ticket_rules(id) ON DELETE CASCADE,
  condition_type text NOT NULL,
  operator text NOT NULL DEFAULT 'gt',
  value_numeric numeric,
  value_numeric_max numeric,
  value_text text,
  time_unit text DEFAULT 'days',
  date_reference text DEFAULT 'due_date',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_condition_type CHECK (condition_type IN (
    'balance_threshold',
    'invoice_count_overdue',
    'invoice_age_days',
    'payment_pattern_deviation',
    'payment_amount_drop',
    'days_since_last_payment',
    'invoice_amount_threshold',
    'overdue_percentage',
    'payment_frequency_change',
    'total_overdue_amount'
  )),
  CONSTRAINT valid_operator CHECK (operator IN ('gt', 'lt', 'gte', 'lte', 'eq', 'between', 'pct_drop'))
);

-- Create targets table for customer scope
CREATE TABLE IF NOT EXISTS auto_ticket_rule_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES auto_ticket_rules(id) ON DELETE CASCADE,
  target_type text NOT NULL DEFAULT 'include',
  customer_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_target_type CHECK (target_type IN ('include', 'exclude'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rule_conditions_rule_id ON auto_ticket_rule_conditions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_targets_rule_id ON auto_ticket_rule_targets(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_targets_customer_id ON auto_ticket_rule_targets(customer_id);

-- Enable RLS
ALTER TABLE auto_ticket_rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_ticket_rule_targets ENABLE ROW LEVEL SECURITY;

-- RLS for conditions
CREATE POLICY "Admins and managers can manage rule conditions"
  ON auto_ticket_rule_conditions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can insert rule conditions"
  ON auto_ticket_rule_conditions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can update rule conditions"
  ON auto_ticket_rule_conditions
  FOR UPDATE
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

CREATE POLICY "Admins and managers can delete rule conditions"
  ON auto_ticket_rule_conditions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- RLS for targets
CREATE POLICY "Admins and managers can manage rule targets"
  ON auto_ticket_rule_targets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can insert rule targets"
  ON auto_ticket_rule_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can update rule targets"
  ON auto_ticket_rule_targets
  FOR UPDATE
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

CREATE POLICY "Admins and managers can delete rule targets"
  ON auto_ticket_rule_targets
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Collectors can view conditions for their assigned rules
CREATE POLICY "Collectors can view conditions for their rules"
  ON auto_ticket_rule_conditions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auto_ticket_rules atr
      WHERE atr.id = rule_id
      AND atr.assigned_collector_id = auth.uid()
    )
  );

-- Collectors can view targets for their assigned rules
CREATE POLICY "Collectors can view targets for their rules"
  ON auto_ticket_rule_targets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auto_ticket_rules atr
      WHERE atr.id = rule_id
      AND atr.assigned_collector_id = auth.uid()
    )
  );

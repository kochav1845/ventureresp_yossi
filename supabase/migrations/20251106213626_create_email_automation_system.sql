/*
  # Email Automation System Schema

  ## Overview
  This migration creates a comprehensive email automation system for sending scheduled emails to customers.

  ## New Tables
  
  ### 1. `email_formulas`
  Stores different email sending schedule configurations (e.g., send on days 1, 3, 4 with varying frequencies)
  - `id` (uuid, primary key)
  - `name` (text) - Name of the formula (e.g., "Formula 1", "Standard Follow-up")
  - `description` (text) - Optional description of the formula
  - `schedule` (jsonb) - Array of schedule objects: [{ day: 1, frequency: 1 }, { day: 3, frequency: 1 }, { day: 4, frequency: 2 }]
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. `email_templates`
  Stores reusable email templates with subject and body
  - `id` (uuid, primary key)
  - `name` (text) - Template name for identification
  - `subject` (text) - Email subject line (supports variables: {customer_name}, {month})
  - `body` (text) - Email body content (supports variables: {customer_name}, {month})
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. `customers`
  Stores customer information and email addresses
  - `id` (uuid, primary key)
  - `name` (text) - Customer name
  - `email` (text, unique) - Customer email address
  - `is_active` (boolean) - Toggle to enable/disable email sending for this customer
  - `responded_this_month` (boolean) - Checkbox to track if customer responded this month
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. `customer_assignments`
  Links customers with their assigned formula and template
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers)
  - `formula_id` (uuid, foreign key to email_formulas)
  - `template_id` (uuid, foreign key to email_templates)
  - `start_day_of_month` (integer) - Which day of the month to start the campaign (1-31)
  - `send_time` (time) - What time of day to send emails (e.g., "09:00:00")
  - `is_active` (boolean) - Whether this assignment is currently active
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 5. `email_logs`
  Tracks all emails sent through the system
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers)
  - `assignment_id` (uuid, foreign key to customer_assignments)
  - `template_id` (uuid, foreign key to email_templates)
  - `subject` (text) - The actual subject sent (with variables replaced)
  - `body` (text) - The actual body sent (with variables replaced)
  - `scheduled_for` (timestamptz) - When the email was scheduled to be sent
  - `sent_at` (timestamptz) - When the email was actually sent
  - `status` (text) - Status: 'pending', 'sent', 'failed'
  - `error_message` (text) - Error details if sending failed
  - `created_at` (timestamptz)

  ## Security
  - Enable Row Level Security (RLS) on all tables
  - Admin users can perform all operations
  - Customer users cannot access email automation tables
*/

-- Create email_formulas table
CREATE TABLE IF NOT EXISTS email_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  responded_this_month boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create customer_assignments table
CREATE TABLE IF NOT EXISTS customer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  formula_id uuid NOT NULL REFERENCES email_formulas(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  start_day_of_month integer NOT NULL CHECK (start_day_of_month >= 1 AND start_day_of_month <= 31),
  send_time time NOT NULL DEFAULT '09:00:00',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES customer_assignments(id) ON DELETE SET NULL,
  template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE email_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_formulas
CREATE POLICY "Admins can view all formulas"
  ON email_formulas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert formulas"
  ON email_formulas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update formulas"
  ON email_formulas FOR UPDATE
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

CREATE POLICY "Admins can delete formulas"
  ON email_formulas FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for email_templates
CREATE POLICY "Admins can view all templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert templates"
  ON email_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update templates"
  ON email_templates FOR UPDATE
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

CREATE POLICY "Admins can delete templates"
  ON email_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for customers
CREATE POLICY "Admins can view all customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update customers"
  ON customers FOR UPDATE
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

CREATE POLICY "Admins can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for customer_assignments
CREATE POLICY "Admins can view all assignments"
  ON customer_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert assignments"
  ON customer_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update assignments"
  ON customer_assignments FOR UPDATE
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

CREATE POLICY "Admins can delete assignments"
  ON customer_assignments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for email_logs
CREATE POLICY "Admins can view all email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert email logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update email logs"
  ON email_logs FOR UPDATE
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customer_assignments_customer_id ON customer_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_assignments_is_active ON customer_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_email_logs_customer_id ON email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_scheduled_for ON email_logs(scheduled_for);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_email_formulas_updated_at ON email_formulas;
CREATE TRIGGER update_email_formulas_updated_at
  BEFORE UPDATE ON email_formulas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_assignments_updated_at ON customer_assignments;
CREATE TRIGGER update_customer_assignments_updated_at
  BEFORE UPDATE ON customer_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

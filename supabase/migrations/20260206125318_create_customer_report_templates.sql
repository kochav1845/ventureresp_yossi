/*
  # Create Customer Report Templates System

  1. New Tables
    - `customer_report_templates`
      - `id` (uuid, primary key)
      - `name` (text) - Template name
      - `subject` (text) - Email subject line with placeholders
      - `body` (text) - Email body with placeholders
      - `include_invoice_table` (boolean) - Whether to include detailed invoice table
      - `include_payment_table` (boolean) - Whether to include payment history table
      - `include_pdf_attachment` (boolean) - Whether to attach PDF
      - `is_default` (boolean) - Whether this is the default template
      - `created_by` (uuid, foreign key to user_profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `customer_report_templates` table
    - Admins can view, create, update, and delete templates
    - Users with permission can view templates

  3. Available Placeholders
    The system will support these dynamic fields:
    - {{customer_name}} - Customer's full name
    - {{customer_id}} - Customer's ID
    - {{customer_email}} - Customer's email
    - {{balance}} - Current outstanding balance
    - {{total_invoices}} - Total number of unpaid invoices
    - {{date_from}} - Start date of report period
    - {{date_to}} - End date of report period
    - {{credit_memos_count}} - Number of credit memos
    - {{credit_memos_total}} - Total amount of credit memos
    - {{oldest_invoice_date}} - Date of oldest unpaid invoice
    - {{days_overdue}} - Days since oldest invoice due date
    - {{payment_url}} - URL for customer to make payment
    - {{invoice_table}} - Detailed table of all invoices (if enabled)
    - {{payment_table}} - Payment history table (if enabled)
*/

CREATE TABLE IF NOT EXISTS customer_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT 'Account Statement - {{customer_name}}',
  body text NOT NULL,
  include_invoice_table boolean DEFAULT true,
  include_payment_table boolean DEFAULT false,
  include_pdf_attachment boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_report_templates_default ON customer_report_templates(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_report_templates_created_by ON customer_report_templates(created_by);

-- Enable RLS
ALTER TABLE customer_report_templates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage report templates"
  ON customer_report_templates
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

-- Users with permission can view templates
CREATE POLICY "Users can view report templates"
  ON customer_report_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert a default template
INSERT INTO customer_report_templates (name, subject, body, include_invoice_table, include_payment_table, include_pdf_attachment, is_default)
VALUES (
  'Standard Account Statement',
  'Account Statement - {{customer_name}}',
  'Dear {{customer_name}},

This is a statement of your account with Venture Respiratory as of {{date_to}}.

Current Outstanding Balance: {{balance}}
Total Unpaid Invoices: {{total_invoices}}

{{invoice_table}}

If you have already submitted payment, please disregard this notice. If you have any questions regarding your account, please contact us.

You can make a payment online at: {{payment_url}}

Thank you for your business.

Best regards,
Venture Respiratory',
  true,
  false,
  true,
  true
) ON CONFLICT DO NOTHING;

-- Function to ensure only one default template
CREATE OR REPLACE FUNCTION ensure_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE customer_report_templates
    SET is_default = false
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain single default
DROP TRIGGER IF EXISTS trigger_ensure_single_default_template ON customer_report_templates;
CREATE TRIGGER trigger_ensure_single_default_template
  BEFORE INSERT OR UPDATE ON customer_report_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_template();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_report_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_report_template_timestamp ON customer_report_templates;
CREATE TRIGGER trigger_update_report_template_timestamp
  BEFORE UPDATE ON customer_report_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_report_template_timestamp();
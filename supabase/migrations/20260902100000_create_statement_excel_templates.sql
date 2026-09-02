/*
  # Statement Excel Templates

  Templates that control how the Excel sheet attached to a customer statement
  looks (title, customer info block, aging summary, invoice columns, total row).
  Edited from the Settings drawer on the Customer Statements page.

  1. New Tables
    - `statement_excel_templates`
      - `id` (uuid, primary key)
      - `name` (text) - Template name
      - `layout` (jsonb) - The sheet layout:
          {
            "title": "Account Statement",             -- supports {{customer_name}}, {{customer_id}}, {{date}}
            "sheet_name": "Statement",
            "customer_fields": ["customer_name", "customer_id", "email", "terms", "statement_date", "total_balance"],
            "show_aging_summary": true,
            "columns": [ { "key": "reference_number", "label": "Invoice #", "enabled": true }, ... ],
            "show_total_row": true
          }
      - `is_default` (boolean) - Used when no template is picked explicitly
      - `created_by` (uuid, fk user_profiles)
      - `created_at` / `updated_at` (timestamptz)

  2. Security
    - RLS enabled: admins manage, all authenticated users can read
      (mirrors customer_report_templates).
*/

CREATE TABLE IF NOT EXISTS statement_excel_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statement_excel_templates_default
  ON statement_excel_templates(is_default) WHERE is_default = true;

ALTER TABLE statement_excel_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage statement excel templates" ON statement_excel_templates;
CREATE POLICY "Admins can manage statement excel templates"
  ON statement_excel_templates
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

DROP POLICY IF EXISTS "Users can view statement excel templates" ON statement_excel_templates;
CREATE POLICY "Users can view statement excel templates"
  ON statement_excel_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Only one default template at a time.
CREATE OR REPLACE FUNCTION ensure_single_default_excel_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE statement_excel_templates
    SET is_default = false
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_excel_template ON statement_excel_templates;
CREATE TRIGGER trigger_ensure_single_default_excel_template
  BEFORE INSERT OR UPDATE ON statement_excel_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_excel_template();

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION update_statement_excel_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_statement_excel_template_timestamp ON statement_excel_templates;
CREATE TRIGGER trigger_update_statement_excel_template_timestamp
  BEFORE UPDATE ON statement_excel_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_statement_excel_template_timestamp();

-- Seed a default template matching the layout statements have always used.
INSERT INTO statement_excel_templates (name, layout, is_default)
SELECT
  'Standard Statement',
  '{
    "title": "Account Statement",
    "sheet_name": "Statement",
    "customer_fields": ["customer_name", "customer_id", "email", "terms", "statement_date", "total_balance"],
    "show_aging_summary": true,
    "columns": [
      { "key": "reference_number", "label": "Invoice #", "enabled": true },
      { "key": "date", "label": "Date", "enabled": true },
      { "key": "due_date", "label": "Due Date", "enabled": true },
      { "key": "description", "label": "Description", "enabled": true },
      { "key": "amount", "label": "Amount", "enabled": true },
      { "key": "balance", "label": "Balance", "enabled": true },
      { "key": "days_overdue", "label": "Days Overdue", "enabled": true },
      { "key": "aging", "label": "Aging", "enabled": true },
      { "key": "type", "label": "Type", "enabled": false },
      { "key": "status", "label": "Status", "enabled": false }
    ],
    "show_total_row": true
  }'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM statement_excel_templates);

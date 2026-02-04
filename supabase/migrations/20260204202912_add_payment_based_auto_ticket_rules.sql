/*
  # Add Payment-Based Auto Ticket Rules

  1. Changes to existing tables
    - Add `rule_type` column to auto_ticket_rules ('invoice_age' or 'payment_recency')
    - Add `check_payment_within_days_min` and `check_payment_within_days_max` for payment recency rules
    - Make invoice date fields nullable (not needed for payment rules)
    
  2. Logic
    - Invoice age rules: Check for invoices within date range (existing behavior)
    - Payment recency rules: Check if last payment is outside date range (new behavior)
    
  3. Security
    - No RLS changes needed (inherits existing policies)
*/

-- Add rule_type column
ALTER TABLE auto_ticket_rules
ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'invoice_age'
CHECK (rule_type IN ('invoice_age', 'payment_recency'));

-- Add payment recency fields
ALTER TABLE auto_ticket_rules
ADD COLUMN IF NOT EXISTS check_payment_within_days_min integer,
ADD COLUMN IF NOT EXISTS check_payment_within_days_max integer;

-- Make invoice date fields nullable for payment recency rules
ALTER TABLE auto_ticket_rules
ALTER COLUMN min_days_old DROP NOT NULL,
ALTER COLUMN max_days_old DROP NOT NULL;

-- Add check constraint to ensure proper fields are set based on rule type
ALTER TABLE auto_ticket_rules
ADD CONSTRAINT auto_ticket_rules_fields_check
CHECK (
  (rule_type = 'invoice_age' AND min_days_old IS NOT NULL AND max_days_old IS NOT NULL) OR
  (rule_type = 'payment_recency' AND check_payment_within_days_min IS NOT NULL AND check_payment_within_days_max IS NOT NULL)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_auto_ticket_rules_rule_type ON auto_ticket_rules(rule_type);

-- Add comment to table
COMMENT ON COLUMN auto_ticket_rules.rule_type IS 'Type of rule: invoice_age (checks for old invoices) or payment_recency (checks for missing payments)';
COMMENT ON COLUMN auto_ticket_rules.check_payment_within_days_min IS 'For payment_recency rules: minimum days since last payment';
COMMENT ON COLUMN auto_ticket_rules.check_payment_within_days_max IS 'For payment_recency rules: maximum days since last payment';

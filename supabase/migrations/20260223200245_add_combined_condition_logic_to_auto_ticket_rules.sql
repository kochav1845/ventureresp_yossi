/*
  # Add combined AND/OR condition logic to auto-ticket rules

  1. Changes to `auto_ticket_rules`
    - Add `condition_logic` column: 'invoice_only', 'payment_only', 'both_and', 'both_or'
    - Update field validation constraint to allow both sets of fields for combined rules
    - Update unique constraint to account for combined rules
    - Migrate existing rules to new column values

  2. Logic
    - 'invoice_only': Only checks invoice age (existing invoice_age behavior)
    - 'payment_only': Only checks payment recency (existing payment_recency behavior)
    - 'both_and': Invoice age AND payment recency must BOTH match
    - 'both_or': Invoice age OR payment recency match (either triggers)
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_ticket_rules' AND column_name = 'condition_logic'
  ) THEN
    ALTER TABLE auto_ticket_rules
    ADD COLUMN condition_logic text NOT NULL DEFAULT 'invoice_only'
    CHECK (condition_logic IN ('invoice_only', 'payment_only', 'both_and', 'both_or'));
  END IF;
END $$;

UPDATE auto_ticket_rules
SET condition_logic = CASE
  WHEN rule_type = 'invoice_age' THEN 'invoice_only'
  WHEN rule_type = 'payment_recency' THEN 'payment_only'
  ELSE 'invoice_only'
END
WHERE condition_logic = 'invoice_only' AND rule_type = 'payment_recency';

ALTER TABLE auto_ticket_rules DROP CONSTRAINT IF EXISTS auto_ticket_rules_fields_check;

ALTER TABLE auto_ticket_rules
ADD CONSTRAINT auto_ticket_rules_fields_check
CHECK (
  (condition_logic = 'invoice_only' AND min_days_old IS NOT NULL AND max_days_old IS NOT NULL) OR
  (condition_logic = 'payment_only' AND check_payment_within_days_min IS NOT NULL AND check_payment_within_days_max IS NOT NULL) OR
  (condition_logic IN ('both_and', 'both_or') AND min_days_old IS NOT NULL AND max_days_old IS NOT NULL AND check_payment_within_days_min IS NOT NULL AND check_payment_within_days_max IS NOT NULL)
);

ALTER TABLE auto_ticket_rules DROP CONSTRAINT IF EXISTS auto_ticket_rules_customer_rule_type_key;

ALTER TABLE auto_ticket_rules
ADD CONSTRAINT auto_ticket_rules_customer_logic_key
UNIQUE (customer_id, condition_logic);

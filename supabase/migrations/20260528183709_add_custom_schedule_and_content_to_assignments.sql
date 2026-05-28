/*
  # Add custom schedule and content fields to customer_assignments

  1. Modified Tables
    - `customer_assignments`
      - `custom_schedule` (jsonb, nullable) - Manual schedule as JSON array of {day, times[]}
      - `custom_subject` (text, nullable) - Custom email subject line
      - `custom_body` (text, nullable) - Custom email body content
      - Make `formula_id` and `template_id` nullable for manual entries

  2. Notes
    - Allows assignments to use either a formula/template OR custom schedule/content
    - Existing assignments are unaffected (formula_id/template_id remain populated)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'custom_schedule'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN custom_schedule jsonb DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'custom_subject'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN custom_subject text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'custom_body'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN custom_body text DEFAULT NULL;
  END IF;
END $$;

-- Make formula_id nullable (allows manual schedule)
ALTER TABLE customer_assignments ALTER COLUMN formula_id DROP NOT NULL;

-- Make template_id nullable (allows custom content)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'template_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE customer_assignments ALTER COLUMN template_id DROP NOT NULL;
  END IF;
END $$;

/*
  # Add document date and financial period columns to payments

  1. Changes
    - Added `doc_date` column (timestamptz) to `acumatica_payments`
      - Stores the actual document creation date (DocDate from Acumatica)
      - For credit memos, this differs from `application_date` which is the last adjustment date
    - Added `financial_period` column (text) to `acumatica_payments`
      - Stores the financial period (e.g., '082023') from Acumatica
    - Added index on `doc_date` for efficient date-range queries

  2. Important Notes
    - `application_date` for credit memos = the Adjustment Date (when it was last applied)
    - `doc_date` for credit memos = the real Document Date (when it was created)
    - For regular payments, doc_date will typically be NULL (application_date is correct)
    - DB functions should use COALESCE(doc_date, application_date) to get the effective date
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'doc_date'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN doc_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'financial_period'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN financial_period text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_doc_date ON acumatica_payments(doc_date) WHERE doc_date IS NOT NULL;

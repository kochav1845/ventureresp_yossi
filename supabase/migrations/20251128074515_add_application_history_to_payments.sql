/*
  # Add ApplicationHistory to Acumatica Payments Table

  1. Changes
    - Add `application_history` (jsonb) column to store payment application details
    - This stores the ApplicationHistory array fetched from Acumatica API
    - Contains records of which invoices the payment was applied to

  ## Important Notes
  - ApplicationHistory contains detailed payment application records
  - Each record includes: AdjustedRefNbr (invoice), AmountPaid, Date, Balance, etc.
  - This data is essential for tracking payment-to-invoice relationships
*/

-- Add application_history column to acumatica_payments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'application_history'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN application_history jsonb;
  END IF;
END $$;

-- Create index for ApplicationHistory queries
CREATE INDEX IF NOT EXISTS idx_payments_application_history ON acumatica_payments USING gin(application_history);

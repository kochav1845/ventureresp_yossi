/*
  # Add Invoice Date to Payment Applications

  ## Summary
  Adds an invoice_date column to the payment_invoice_applications table
  to support payment timing analysis without needing to join with invoices table.

  ## Changes
  - Add `invoice_date` column to `payment_invoice_applications`
  - Add index on invoice_date for performance

  ## Purpose
  The invoice reference numbers in payment_invoice_applications don't always
  match the reference_number in acumatica_invoices, so we need to store
  the invoice date directly in the applications table for analytics.
*/

-- Add invoice_date column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_invoice_applications' 
    AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE payment_invoice_applications 
    ADD COLUMN invoice_date date;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_payment_invoice_apps_invoice_date 
  ON payment_invoice_applications(invoice_date);

-- Try to populate invoice_date from matching invoices
UPDATE payment_invoice_applications pia
SET invoice_date = i.date
FROM acumatica_invoices i
WHERE pia.invoice_reference_number = i.reference_number
  AND pia.invoice_date IS NULL
  AND i.date IS NOT NULL;

/*
  # Fix invoice unique constraint to be composite (reference_number, type)

  1. Problem
    - The unique constraint on `acumatica_invoices.reference_number` alone prevents
      inserting invoices that share a reference number across different types
      (e.g., Invoice #085943 from 2019 blocks Credit Memo #085943 from Aug 2025)
    - This causes "duplicate key" errors during sync, leaving invoices permanently missing

  2. Changes
    - Drop the single-column unique constraint on `reference_number`
    - Add a composite unique constraint on `(reference_number, type)`
    - This correctly models Acumatica where ref numbers are unique per type, not globally

  3. Important Notes
    - No foreign keys reference the old constraint, so this is safe
    - The existing composite check in the sync code already uses both fields
*/

ALTER TABLE acumatica_invoices
  DROP CONSTRAINT IF EXISTS acumatica_invoices_reference_number_key;

ALTER TABLE acumatica_invoices
  ADD CONSTRAINT acumatica_invoices_reference_number_type_key
  UNIQUE (reference_number, type);

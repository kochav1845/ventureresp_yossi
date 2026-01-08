/*
  # Add Unique Constraint to Invoice Reference Number

  ## Purpose
  Prevent duplicate invoice reference numbers from being created in the future.
  All invoices are now normalized to 6-digit format, so we can safely add this constraint.

  ## Changes
  - Create unique index on reference_number column
*/

-- Create unique index if it doesn't already exist
CREATE UNIQUE INDEX IF NOT EXISTS acumatica_invoices_reference_number_unique 
  ON acumatica_invoices(reference_number);

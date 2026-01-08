/*
  # Add unique constraint to payment_invoice_applications

  1. Changes
    - Add unique constraint on (payment_id, invoice_reference_number) to prevent duplicate applications
    - This allows upsert operations to work correctly during sync
*/

-- First, remove any existing duplicates by keeping only the most recent one
DELETE FROM payment_invoice_applications a
USING payment_invoice_applications b
WHERE a.id < b.id
  AND a.payment_id = b.payment_id
  AND a.invoice_reference_number = b.invoice_reference_number;

-- Add unique constraint
ALTER TABLE payment_invoice_applications
ADD CONSTRAINT payment_invoice_applications_payment_invoice_unique 
UNIQUE (payment_id, invoice_reference_number);

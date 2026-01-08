/*
  # Add Document Type to Payment Applications

  1. Changes
    - Add `doc_type` column to `payment_invoice_applications` table
    - This will store whether the document is an Invoice, Credit Memo, etc.
    
  2. Purpose
    - Allow UI to differentiate between invoices and credit memos
    - Improve filtering and organization of payment applications
*/

ALTER TABLE payment_invoice_applications 
ADD COLUMN IF NOT EXISTS doc_type text;

COMMENT ON COLUMN payment_invoice_applications.doc_type IS 'Type of document (e.g., Invoice, Credit Memo, Debit Memo)';

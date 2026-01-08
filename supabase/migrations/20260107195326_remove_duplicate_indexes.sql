/*
  # Remove Duplicate Indexes

  1. Index Cleanup
    - Remove duplicate indexes that serve the same purpose
    - Keep one index from each duplicate pair

  2. Duplicates Removed
    - acumatica_invoices: idx_invoices_balance (keep idx_acumatica_invoices_balance)
    - acumatica_invoices: idx_invoices_reference_number_exact (keep idx_acumatica_invoices_reference_number)
    - acumatica_invoices: idx_invoices_status (keep idx_acumatica_invoices_status)
    - acumatica_invoices: acumatica_invoices_reference_number_unique (keep acumatica_invoices_reference_number_key)
    - acumatica_payments: idx_payments_customer_id (keep idx_acumatica_payments_customer_id)
    - acumatica_payments: idx_payments_customer_name (keep idx_acumatica_payments_customer_name)
    - outbound_replies: idx_outbound_replies_inbound_email_id (keep idx_outbound_replies_inbound_email)
*/

-- Remove duplicate indexes on acumatica_invoices
DROP INDEX IF EXISTS idx_invoices_balance;
DROP INDEX IF EXISTS idx_invoices_reference_number_exact;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS acumatica_invoices_reference_number_unique;

-- Remove duplicate indexes on acumatica_payments
DROP INDEX IF EXISTS idx_payments_customer_id;
DROP INDEX IF EXISTS idx_payments_customer_name;

-- Remove duplicate indexes on outbound_replies
DROP INDEX IF EXISTS idx_outbound_replies_inbound_email_id;

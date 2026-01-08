/*
  # Remove Stripe Payment System

  This migration removes all Stripe-related tables from the database.

  ## Tables Dropped
    - `stripe_checkout_sessions` - Stripe checkout session tracking
    - `stripe_payment_records` - Completed Stripe payment records
    - `stripe_invoice_payments` - Junction table linking Stripe payments to invoices

  ## Notes
    - The `balance` and `description` fields in `acumatica_invoices` are preserved
      as they may be used by other systems
    - All data in these tables will be permanently deleted
*/

-- Drop tables in order to avoid foreign key conflicts
DROP TABLE IF EXISTS stripe_invoice_payments CASCADE;
DROP TABLE IF EXISTS stripe_payment_records CASCADE;
DROP TABLE IF EXISTS stripe_checkout_sessions CASCADE;

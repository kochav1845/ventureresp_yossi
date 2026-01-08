/*
  # Add Customer Analytics Exclusion Flags

  1. Changes
    - Add `exclude_from_payment_analytics` (boolean) to acumatica_customers
    - Add `exclude_from_invoice_analytics` (boolean) to acumatica_customers
    - Add `exclude_from_customer_analytics` (boolean) to acumatica_customers
    - All default to false (included by default)

  2. Purpose
    - Allow admins to exclude specific customers from analytics calculations
    - Useful for filtering out test accounts, internal accounts, etc.
    - Provides granular control over which analytics each customer affects
*/

-- Add exclusion flags to acumatica_customers table
ALTER TABLE acumatica_customers 
ADD COLUMN IF NOT EXISTS exclude_from_payment_analytics boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS exclude_from_invoice_analytics boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS exclude_from_customer_analytics boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN acumatica_customers.exclude_from_payment_analytics IS 'When true, this customer is excluded from payment timing analytics';
COMMENT ON COLUMN acumatica_customers.exclude_from_invoice_analytics IS 'When true, this customer is excluded from invoice status analytics';
COMMENT ON COLUMN acumatica_customers.exclude_from_customer_analytics IS 'When true, this customer is excluded from customer performance analytics';

/*
  # Add Test Customers to Acumatica Customers

  Adds the email system's test customers into the acumatica_customers table
  so they can be viewed and managed from the main Customers page.

  1. Modified Tables
    - `acumatica_customers`
      - Added `is_test_customer` (boolean, default false) flag

  2. Data Changes
    - Inserts all customers from the email `customers` table as test customers
    - Test customer IDs are prefixed with "TEST-" for clarity

  3. Security
    - No changes to RLS (existing policies apply)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'is_test_customer'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN is_test_customer boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acumatica_customers_test ON acumatica_customers(is_test_customer);

INSERT INTO acumatica_customers (customer_id, customer_name, email_address, is_test_customer)
SELECT
  'TEST-' || ROW_NUMBER() OVER (ORDER BY c.created_at),
  c.name,
  c.email,
  true
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM acumatica_customers ac
  WHERE ac.email_address = c.email AND ac.is_test_customer = true
)
ON CONFLICT (customer_id) DO NOTHING;

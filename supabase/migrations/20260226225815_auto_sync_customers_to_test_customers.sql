/*
  # Auto-sync email customers to acumatica_customers as test customers

  1. Changes
    - Creates a trigger function `sync_customer_to_acumatica_test` that fires on
      INSERT, UPDATE, and DELETE on the `customers` table
    - On INSERT: creates a corresponding row in `acumatica_customers` with
      `is_test_customer = true` and a `TEST-{uuid}` customer_id
    - On UPDATE: updates the matching test customer's name and email
    - On DELETE: removes the matching test customer row

  2. Purpose
    - When users add new customers via the Manage Customers modal (email assignments),
      those customers automatically appear under the "Test Customers" toggle
      in the Acumatica Customers page
*/

CREATE OR REPLACE FUNCTION sync_customer_to_acumatica_test()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO acumatica_customers (
      customer_id,
      customer_name,
      email_address,
      is_test_customer,
      customer_status
    ) VALUES (
      'TEST-' || NEW.id,
      NEW.name,
      NEW.email,
      true,
      'Active'
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      email_address = EXCLUDED.email_address,
      updated_at = now();
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE acumatica_customers
    SET customer_name = NEW.name,
        email_address = NEW.email,
        updated_at = now()
    WHERE customer_id = 'TEST-' || NEW.id
      AND is_test_customer = true;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM acumatica_customers
    WHERE customer_id = 'TEST-' || OLD.id
      AND is_test_customer = true;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_customer_to_acumatica_test ON customers;

CREATE TRIGGER trg_sync_customer_to_acumatica_test
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION sync_customer_to_acumatica_test();

-- Backfill: ensure all existing customers that don't yet have a test entry get one
INSERT INTO acumatica_customers (customer_id, customer_name, email_address, is_test_customer, customer_status)
SELECT
  'TEST-' || c.id,
  c.name,
  c.email,
  true,
  'Active'
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM acumatica_customers ac
  WHERE ac.customer_id = 'TEST-' || c.id
)
ON CONFLICT (customer_id) DO NOTHING;

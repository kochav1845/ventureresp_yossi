/*
  # Auto-Populate Payment Customer Names
  
  1. Changes
    - Creates a function to lookup and populate customer_name from customer_id
    - Creates a trigger to automatically set customer_name on insert/update
    - Backfills customer_name for all existing payments with customer_id
  
  2. Purpose
    - Fixes the issue where payments show "N/A" for customer names
    - Ensures customer_name is always populated when customer_id exists
    - Maintains data consistency between payments and customers tables
*/

-- Function to populate customer name from customer_id
CREATE OR REPLACE FUNCTION populate_payment_customer_name()
RETURNS TRIGGER AS $$
BEGIN
  -- If customer_id is set and customer_name is NULL, look it up
  IF NEW.customer_id IS NOT NULL AND (NEW.customer_name IS NULL OR NEW.customer_name = '') THEN
    SELECT customer_name INTO NEW.customer_name
    FROM acumatica_customers
    WHERE customer_id = NEW.customer_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new inserts and updates
DROP TRIGGER IF EXISTS trigger_populate_payment_customer_name ON acumatica_payments;

CREATE TRIGGER trigger_populate_payment_customer_name
  BEFORE INSERT OR UPDATE ON acumatica_payments
  FOR EACH ROW
  EXECUTE FUNCTION populate_payment_customer_name();

-- Backfill customer_name for existing payments
UPDATE acumatica_payments p
SET customer_name = c.customer_name
FROM acumatica_customers c
WHERE p.customer_id = c.customer_id
  AND (p.customer_name IS NULL OR p.customer_name = '');
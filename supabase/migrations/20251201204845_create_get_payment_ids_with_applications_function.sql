/*
  # Create function to get payment IDs with applications

  1. Function
    - `get_payment_ids_with_applications()` - Returns distinct payment IDs that have invoice applications
    - Returns an array of UUIDs for efficient filtering
    - Much faster than fetching all rows and filtering in the client

  2. Performance
    - Uses DISTINCT to eliminate duplicates at the database level
    - Returns only the IDs needed for filtering
*/

CREATE OR REPLACE FUNCTION get_payment_ids_with_applications()
RETURNS TABLE (payment_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT pia.payment_id
  FROM payment_invoice_applications pia;
END;
$$ LANGUAGE plpgsql STABLE;
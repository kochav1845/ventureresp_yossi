/*
  # Fix Payment Application Status Function

  1. Changes
    - Replace get_payment_ids_with_applications() with proper function
    - Returns all payment data with application counts
    - Includes customer names from acumatica_customers table
    - Shows 0 for payments without applications

  2. Performance
    - Uses LEFT JOIN to include all payments
    - Aggregates application counts efficiently
    - Orders by application date descending
*/

DROP FUNCTION IF EXISTS get_payment_ids_with_applications();

CREATE OR REPLACE FUNCTION get_payment_ids_with_applications()
RETURNS TABLE (
  id uuid,
  reference_number text,
  type text,
  customer_id text,
  customer_name text,
  payment_amount numeric,
  status text,
  application_date timestamptz,
  app_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.reference_number,
    p.type,
    p.customer_id,
    COALESCE(c.customer_name, p.customer_id) as customer_name,
    p.payment_amount,
    p.status,
    p.application_date,
    COUNT(pia.id) as app_count
  FROM acumatica_payments p
  LEFT JOIN acumatica_customers c ON p.customer_id = c.customer_id
  LEFT JOIN payment_invoice_applications pia ON p.id = pia.payment_id
  GROUP BY p.id, p.reference_number, p.type, p.customer_id, c.customer_name,
           p.payment_amount, p.status, p.application_date
  ORDER BY p.application_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;
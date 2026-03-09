/*
  # Create Lightweight Customer Picker Function

  1. New Functions
    - `get_customers_for_picker` - Fast function that returns only customer_id, customer_name,
      and gross_balance for use in dropdown pickers (e.g., ticket creation)
    - Skips heavy calculations like avg_days_to_collect, color status counts, date filtering
    - Supports search, pagination, and sorting by name

  2. Important Notes
    - SECURITY DEFINER to bypass RLS for consistent access
    - Much faster than get_customers_with_balance for simple picker use cases
    - Filters out test customers by default
*/

CREATE OR REPLACE FUNCTION get_customers_for_picker(
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  customer_id TEXT,
  customer_name TEXT,
  gross_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.customer_id,
    c.customer_name,
    COALESCE(
      (SELECT SUM(i.balance)
       FROM acumatica_invoices i
       WHERE i.customer = c.customer_id
         AND i.status = 'Open'
         AND i.balance > 0
         AND i.type = 'Invoice'),
      0
    )::numeric AS gross_balance
  FROM acumatica_customers c
  WHERE c.is_test_customer = false
    AND (p_search IS NULL OR p_search = '' OR
      c.customer_id ILIKE '%' || p_search || '%' OR
      c.customer_name ILIKE '%' || p_search || '%')
  ORDER BY c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
/*
  # Add Date Context to Customer Count Function

  1. Changes
    - Drop the old overloaded version
    - Create a new version with all parameters including p_date_context
    - Match the same logic as get_customers_with_balance for accurate counts

  2. Notes
    - Ensures count matches the filtered results
*/

-- Drop the old overloaded version with date parameters
DROP FUNCTION IF EXISTS get_customers_with_balance_count(text, text, text, timestamptz, timestamptz);

-- Create the new version with all parameters
CREATE OR REPLACE FUNCTION get_customers_with_balance_count(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_country_filter text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_balance_filter text DEFAULT 'all',
  p_min_balance numeric DEFAULT NULL,
  p_max_balance numeric DEFAULT NULL,
  p_min_open_invoices int DEFAULT NULL,
  p_max_open_invoices int DEFAULT NULL,
  p_min_invoice_amount numeric DEFAULT NULL,
  p_max_invoice_amount numeric DEFAULT NULL,
  p_date_context text DEFAULT 'invoice_date'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result bigint;
BEGIN
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(i.balance), 0) as total_balance,
      COUNT(*) as invoice_count
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  ),
  date_filtered_customers AS (
    -- Filter by invoice dates
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE p_date_context = 'invoice_date'
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    
    UNION
    
    -- Filter by customer added date (synced_at)
    SELECT c.customer_id
    FROM acumatica_customers c
    WHERE p_date_context = 'customer_added'
      AND (p_date_from IS NULL OR c.synced_at >= p_date_from)
      AND (p_date_to IS NULL OR c.synced_at <= p_date_to)
    
    UNION
    
    -- Filter by balance date (invoices with balance changes in date range)
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE p_date_context = 'balance_date'
      AND i.balance > 0
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
  )
  SELECT COUNT(*)
  INTO result
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE
    (p_search IS NULL OR p_search = '' OR
     c.customer_id ILIKE '%' || p_search || '%' OR
     c.customer_name ILIKE '%' || p_search || '%' OR
     c.email_address ILIKE '%' || p_search || '%' OR
     c.customer_class ILIKE '%' || p_search || '%' OR
     c.city ILIKE '%' || p_search || '%' OR
     c.country ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
    AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
    AND (
      (p_date_from IS NULL AND p_date_to IS NULL)
      OR c.customer_id IN (SELECT customer FROM date_filtered_customers)
    )
    AND (
      p_balance_filter = 'all' OR
      (p_balance_filter = 'positive' AND COALESCE(cb.total_balance, 0) > 0) OR
      (p_balance_filter = 'negative' AND COALESCE(cb.total_balance, 0) < 0) OR
      (p_balance_filter = 'zero' AND COALESCE(cb.total_balance, 0) = 0)
    )
    AND (p_min_balance IS NULL OR COALESCE(cb.total_balance, 0) >= p_min_balance)
    AND (p_max_balance IS NULL OR COALESCE(cb.total_balance, 0) <= p_max_balance)
    AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
    AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
    AND (
      (p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL)
      OR cb.invoice_count > 0
    );

  RETURN result;
END;
$$;

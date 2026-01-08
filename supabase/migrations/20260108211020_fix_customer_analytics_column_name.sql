/*
  # Fix Customer Analytics Function - Correct Column Name
  
  1. Issue
    - Function was using i.balance_due which doesn't exist
    - Correct column name is i.balance
  
  2. Changes
    - Update function to use correct column name
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_customer_analytics(text, text, text, timestamptz, timestamptz);

-- Create the corrected analytics function
CREATE OR REPLACE FUNCTION get_customer_analytics(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_country_filter text DEFAULT 'all',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_total_customers int;
  v_active_customers int;
  v_total_balance numeric;
  v_avg_balance numeric;
  v_customers_with_debt int;
  v_total_open_invoices bigint;
  v_customers_with_overdue int;
BEGIN
  -- Build the analytics query with filters
  WITH filtered_customers AS (
    SELECT 
      c.customer_id,
      c.customer_status,
      COALESCE(
        (SELECT SUM(i.balance)
         FROM acumatica_invoices i
         WHERE i.customer_id = c.customer_id
         AND i.invoice_status = 'Open'
         AND (p_date_from IS NULL OR i.invoice_date >= p_date_from)
         AND (p_date_to IS NULL OR i.invoice_date <= p_date_to)
        ), 0
      ) as calculated_balance,
      COALESCE(
        (SELECT COUNT(*)
         FROM acumatica_invoices i
         WHERE i.customer_id = c.customer_id
         AND i.invoice_status = 'Open'
         AND (p_date_from IS NULL OR i.invoice_date >= p_date_from)
         AND (p_date_to IS NULL OR i.invoice_date <= p_date_to)
        ), 0
      ) as open_invoice_count,
      COALESCE(
        (SELECT MAX(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - i.due_date)))
         FROM acumatica_invoices i
         WHERE i.customer_id = c.customer_id
         AND i.invoice_status = 'Open'
         AND i.due_date < CURRENT_TIMESTAMP
         AND (p_date_from IS NULL OR i.invoice_date >= p_date_from)
         AND (p_date_to IS NULL OR i.invoice_date <= p_date_to)
        ), 0
      ) as max_days_overdue
    FROM acumatica_customers c
    WHERE 
      (p_search IS NULL OR (
        c.customer_id ILIKE '%' || p_search || '%' OR
        c.customer_name ILIKE '%' || p_search || '%' OR
        c.account_name ILIKE '%' || p_search || '%' OR
        c.email_address ILIKE '%' || p_search || '%' OR
        c.customer_class ILIKE '%' || p_search || '%' OR
        c.city ILIKE '%' || p_search || '%' OR
        c.country ILIKE '%' || p_search || '%'
      ))
      AND (p_status_filter = 'all' OR c.customer_status = p_status_filter)
      AND (p_country_filter = 'all' OR c.country = p_country_filter)
  )
  SELECT 
    COUNT(*)::int,
    COUNT(CASE WHEN customer_status = 'Active' THEN 1 END)::int,
    COALESCE(SUM(calculated_balance), 0),
    CASE 
      WHEN COUNT(CASE WHEN calculated_balance > 0 THEN 1 END) > 0 
      THEN COALESCE(SUM(calculated_balance) / COUNT(CASE WHEN calculated_balance > 0 THEN 1 END), 0)
      ELSE 0 
    END,
    COUNT(CASE WHEN calculated_balance > 0 THEN 1 END)::int,
    COALESCE(SUM(open_invoice_count), 0),
    COUNT(CASE WHEN max_days_overdue > 0 THEN 1 END)::int
  INTO 
    v_total_customers,
    v_active_customers,
    v_total_balance,
    v_avg_balance,
    v_customers_with_debt,
    v_total_open_invoices,
    v_customers_with_overdue
  FROM filtered_customers;

  -- Build JSON result
  v_result := json_build_object(
    'total_customers', COALESCE(v_total_customers, 0),
    'active_customers', COALESCE(v_active_customers, 0),
    'total_balance', COALESCE(v_total_balance, 0),
    'avg_balance', COALESCE(v_avg_balance, 0),
    'customers_with_debt', COALESCE(v_customers_with_debt, 0),
    'total_open_invoices', COALESCE(v_total_open_invoices, 0),
    'customers_with_overdue', COALESCE(v_customers_with_overdue, 0)
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz) TO anon;
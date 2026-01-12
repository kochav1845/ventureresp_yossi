/*
  # Fix Analytics Customers With Debt Logic

  1. Issue
    - When filtering for "Positive Balance", we get 1,073 total customers but 1,026 "customers with debt"
    - This doesn't make sense - if balance filter is "positive", ALL customers should have debt
    - The mismatch occurs because we're counting calculated_balance > 0 again within already-filtered data

  2. Changes
    - When balance_filter = 'positive', customers_with_debt should equal total_customers
    - When balance_filter = 'zero', customers_with_debt should be 0
    - When balance_filter = 'negative', customers_with_debt should be 0
    - Only when balance_filter = 'all' should we count independently
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text);

-- Create the fixed analytics function
CREATE OR REPLACE FUNCTION get_customer_analytics(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_country_filter text DEFAULT 'all',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_excluded_customer_ids text[] DEFAULT NULL,
  p_balance_filter text DEFAULT 'all',
  p_min_balance numeric DEFAULT NULL,
  p_max_balance numeric DEFAULT NULL,
  p_min_open_invoices int DEFAULT NULL,
  p_max_open_invoices int DEFAULT NULL,
  p_date_context text DEFAULT 'invoice_date'
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
  -- Build the analytics query with ALL filters including date context
  WITH date_filtered_customers AS (
    -- Filter by invoice dates
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE p_date_context = 'invoice_date'
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)

    UNION

    -- Filter by customer added date (synced_at)
    SELECT c.customer_id
    FROM acumatica_customers c
    WHERE p_date_context = 'customer_added'
      AND (p_date_from IS NULL OR c.synced_at >= p_date_from)
      AND (p_date_to IS NULL OR c.synced_at <= p_date_to)

    UNION

    -- Filter by balance date (invoices with balance in date range)
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE p_date_context = 'balance_date'
      AND i.balance > 0
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
  ),
  filtered_customers AS (
    SELECT
      c.customer_id,
      c.customer_status,
      COALESCE(
        (SELECT SUM(i.balance)
         FROM acumatica_invoices i
         WHERE i.customer = c.customer_id
         AND i.status = 'Open'
        ), 0
      ) as calculated_balance,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM acumatica_invoices i
         WHERE i.customer = c.customer_id
         AND i.status = 'Open'
        ), 0
      ) as open_invoice_count,
      COALESCE(
        (SELECT MAX(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - i.due_date)))
         FROM acumatica_invoices i
         WHERE i.customer = c.customer_id
         AND i.status = 'Open'
         AND i.due_date < CURRENT_DATE
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
      AND (p_excluded_customer_ids IS NULL OR c.customer_id != ALL(p_excluded_customer_ids))
      AND (
        (p_date_from IS NULL AND p_date_to IS NULL)
        OR c.customer_id IN (SELECT customer FROM date_filtered_customers)
      )
  ),
  -- Apply balance and invoice count filters
  final_filtered AS (
    SELECT *
    FROM filtered_customers
    WHERE
      -- Balance filter
      (p_balance_filter = 'all' OR
       (p_balance_filter = 'positive' AND calculated_balance > 0) OR
       (p_balance_filter = 'negative' AND calculated_balance < 0) OR
       (p_balance_filter = 'zero' AND calculated_balance = 0))
      -- Min/Max balance
      AND (p_min_balance IS NULL OR calculated_balance >= p_min_balance)
      AND (p_max_balance IS NULL OR calculated_balance <= p_max_balance)
      -- Min/Max open invoices
      AND (p_min_open_invoices IS NULL OR open_invoice_count >= p_min_open_invoices)
      AND (p_max_open_invoices IS NULL OR open_invoice_count <= p_max_open_invoices)
  )
  SELECT
    COUNT(*)::int,
    COUNT(CASE WHEN customer_status = 'Active' THEN 1 END)::int,
    COALESCE(SUM(calculated_balance), 0),
    CASE
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(calculated_balance) / COUNT(*), 0)
      ELSE 0
    END,
    -- Smart customers_with_debt calculation based on balance filter
    CASE
      WHEN p_balance_filter = 'positive' THEN COUNT(*)::int  -- All customers have debt
      WHEN p_balance_filter = 'zero' THEN 0                   -- No customers have debt
      WHEN p_balance_filter = 'negative' THEN 0               -- Negative balance means credit, not debt
      ELSE COUNT(CASE WHEN calculated_balance > 0 THEN 1 END)::int  -- Only for 'all' filter
    END,
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
  FROM final_filtered;

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
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO anon;

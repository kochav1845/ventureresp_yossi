/*
  # Drastically Optimize Customer Analytics Function

  1. Problem
    - The function times out because invoice_aggregates CTE scans all invoices
    - UNION in date_filtered_customers causes multiple table scans
    - No pre-filtering before expensive aggregations

  2. Solution
    - Add materialized view or use lighter aggregation
    - Use conditional logic instead of UNION
    - Add indexes for aggregation columns
    - Use simpler counting approach without complex CTEs

  3. New Indexes
    - Index on invoices for customer + status + balance aggregation
    - Index on invoices for customer + due_date for overdue calculation
*/

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status_balance 
  ON acumatica_invoices(customer, status, balance) 
  WHERE status = 'Open';

CREATE INDEX IF NOT EXISTS idx_invoices_customer_overdue
  ON acumatica_invoices(customer, due_date, balance)
  WHERE status = 'Open' AND balance > 0;

CREATE INDEX IF NOT EXISTS idx_customers_status
  ON acumatica_customers(customer_status);

CREATE INDEX IF NOT EXISTS idx_customers_country
  ON acumatica_customers(country);

-- Drop the existing slow function
DROP FUNCTION IF EXISTS get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text);

-- Create drastically optimized analytics function
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
  v_total_customers int := 0;
  v_active_customers int := 0;
  v_total_balance numeric := 0;
  v_avg_balance numeric := 0;
  v_customers_with_debt int := 0;
  v_total_open_invoices bigint := 0;
  v_customers_with_overdue int := 0;
  v_has_filters boolean;
BEGIN
  v_has_filters := (p_search IS NOT NULL) OR 
                   (p_status_filter != 'all') OR 
                   (p_country_filter != 'all') OR 
                   (p_date_from IS NOT NULL) OR 
                   (p_date_to IS NOT NULL) OR
                   (p_excluded_customer_ids IS NOT NULL) OR
                   (p_balance_filter != 'all') OR
                   (p_min_balance IS NOT NULL) OR
                   (p_max_balance IS NOT NULL) OR
                   (p_min_open_invoices IS NOT NULL) OR
                   (p_max_open_invoices IS NOT NULL);

  -- Fast path: No filters - use simple counts
  IF NOT v_has_filters THEN
    SELECT COUNT(*) INTO v_total_customers FROM acumatica_customers;
    SELECT COUNT(*) INTO v_active_customers FROM acumatica_customers WHERE customer_status = 'Active';
    
    SELECT 
      COALESCE(SUM(i.balance), 0),
      COUNT(DISTINCT i.customer),
      COUNT(*)
    INTO v_total_balance, v_customers_with_debt, v_total_open_invoices
    FROM acumatica_invoices i
    WHERE i.status = 'Open' AND i.balance > 0;

    SELECT COUNT(DISTINCT i.customer) INTO v_customers_with_overdue
    FROM acumatica_invoices i
    WHERE i.status = 'Open' AND i.balance > 0 AND i.due_date < CURRENT_DATE;

    v_avg_balance := CASE WHEN v_customers_with_debt > 0 THEN v_total_balance / v_customers_with_debt ELSE 0 END;

    RETURN json_build_object(
      'total_customers', v_total_customers,
      'active_customers', v_active_customers,
      'total_balance', v_total_balance,
      'avg_balance', v_avg_balance,
      'customers_with_debt', v_customers_with_debt,
      'total_open_invoices', v_total_open_invoices,
      'customers_with_overdue', v_customers_with_overdue
    );
  END IF;

  -- Slow path: With filters - use optimized single-pass query
  WITH filtered_customer_ids AS (
    SELECT c.customer_id, c.customer_status
    FROM acumatica_customers c
    WHERE
      (p_search IS NULL OR (
        c.customer_id ILIKE '%' || p_search || '%' OR
        c.customer_name ILIKE '%' || p_search || '%' OR
        c.email_address ILIKE '%' || p_search || '%'
      ))
      AND (p_status_filter = 'all' OR c.customer_status = p_status_filter)
      AND (p_country_filter = 'all' OR c.country = p_country_filter)
      AND (p_excluded_customer_ids IS NULL OR c.customer_id != ALL(p_excluded_customer_ids))
      AND (
        (p_date_from IS NULL AND p_date_to IS NULL) OR
        (p_date_context = 'customer_added' AND 
          (p_date_from IS NULL OR c.synced_at >= p_date_from) AND
          (p_date_to IS NULL OR c.synced_at <= p_date_to)
        ) OR
        (p_date_context IN ('invoice_date', 'balance_date') AND EXISTS (
          SELECT 1 FROM acumatica_invoices i
          WHERE i.customer = c.customer_id
            AND (p_date_from IS NULL OR i.date >= p_date_from::date)
            AND (p_date_to IS NULL OR i.date <= p_date_to::date)
            AND (p_date_context != 'balance_date' OR i.balance > 0)
          LIMIT 1
        ))
      )
  ),
  customer_invoice_stats AS (
    SELECT
      fc.customer_id,
      fc.customer_status,
      COALESCE(SUM(CASE WHEN i.status = 'Open' AND i.balance > 0 THEN i.balance END), 0) as balance,
      COUNT(CASE WHEN i.status = 'Open' AND i.balance > 0 THEN 1 END)::int as invoice_count,
      MAX(CASE WHEN i.status = 'Open' AND i.balance > 0 AND i.due_date < CURRENT_DATE 
          THEN 1 ELSE 0 END) as has_overdue
    FROM filtered_customer_ids fc
    LEFT JOIN acumatica_invoices i ON i.customer = fc.customer_id
    GROUP BY fc.customer_id, fc.customer_status
  ),
  final_stats AS (
    SELECT * FROM customer_invoice_stats
    WHERE
      (p_balance_filter = 'all' OR
       (p_balance_filter = 'positive' AND balance > 0) OR
       (p_balance_filter = 'negative' AND balance < 0) OR
       (p_balance_filter = 'zero' AND balance = 0))
      AND (p_min_balance IS NULL OR balance >= p_min_balance)
      AND (p_max_balance IS NULL OR balance <= p_max_balance)
      AND (p_min_open_invoices IS NULL OR invoice_count >= p_min_open_invoices)
      AND (p_max_open_invoices IS NULL OR invoice_count <= p_max_open_invoices)
  )
  SELECT
    COUNT(*)::int,
    COUNT(CASE WHEN customer_status = 'Active' THEN 1 END)::int,
    COALESCE(SUM(balance), 0),
    CASE WHEN COUNT(CASE WHEN balance > 0 THEN 1 END) > 0 
         THEN COALESCE(SUM(balance), 0) / COUNT(CASE WHEN balance > 0 THEN 1 END)
         ELSE 0 END,
    COUNT(CASE WHEN balance > 0 THEN 1 END)::int,
    COALESCE(SUM(invoice_count), 0),
    COUNT(CASE WHEN has_overdue = 1 THEN 1 END)::int
  INTO
    v_total_customers,
    v_active_customers,
    v_total_balance,
    v_avg_balance,
    v_customers_with_debt,
    v_total_open_invoices,
    v_customers_with_overdue
  FROM final_stats;

  RETURN json_build_object(
    'total_customers', COALESCE(v_total_customers, 0),
    'active_customers', COALESCE(v_active_customers, 0),
    'total_balance', COALESCE(v_total_balance, 0),
    'avg_balance', COALESCE(v_avg_balance, 0),
    'customers_with_debt', COALESCE(v_customers_with_debt, 0),
    'total_open_invoices', COALESCE(v_total_open_invoices, 0),
    'customers_with_overdue', COALESCE(v_customers_with_overdue, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO anon;

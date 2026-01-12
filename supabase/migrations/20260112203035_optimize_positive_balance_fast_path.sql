/*
  # Optimize Positive Balance Fast Path

  1. Problem
    - balanceFilter defaults to 'positive' in the frontend
    - This triggers the slow filtered path every time
    - Need a fast path for positive balance filter

  2. Solution
    - Add special fast path when only balanceFilter='positive' is set
    - Use indexed queries for this common case
*/

DROP FUNCTION IF EXISTS get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text);

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
  v_only_positive_filter boolean;
  v_no_filters boolean;
  v_total_customers int := 0;
  v_active_customers int := 0;
  v_total_balance numeric := 0;
  v_customers_with_debt int := 0;
  v_total_open_invoices bigint := 0;
  v_customers_with_overdue int := 0;
BEGIN
  v_no_filters := (p_search IS NULL OR p_search = '') AND 
                  (p_status_filter IS NULL OR p_status_filter = 'all') AND 
                  (p_country_filter IS NULL OR p_country_filter = 'all') AND 
                  (p_date_from IS NULL) AND 
                  (p_date_to IS NULL) AND
                  (p_excluded_customer_ids IS NULL OR array_length(p_excluded_customer_ids, 1) IS NULL) AND
                  (p_balance_filter IS NULL OR p_balance_filter = 'all') AND
                  (p_min_balance IS NULL) AND
                  (p_max_balance IS NULL) AND
                  (p_min_open_invoices IS NULL) AND
                  (p_max_open_invoices IS NULL);

  v_only_positive_filter := (p_search IS NULL OR p_search = '') AND 
                            (p_status_filter IS NULL OR p_status_filter = 'all') AND 
                            (p_country_filter IS NULL OR p_country_filter = 'all') AND 
                            (p_date_from IS NULL) AND 
                            (p_date_to IS NULL) AND
                            (p_excluded_customer_ids IS NULL OR array_length(p_excluded_customer_ids, 1) IS NULL) AND
                            (p_balance_filter = 'positive') AND
                            (p_min_balance IS NULL) AND
                            (p_max_balance IS NULL) AND
                            (p_min_open_invoices IS NULL) AND
                            (p_max_open_invoices IS NULL);

  IF v_no_filters THEN
    SELECT COUNT(*) INTO v_total_customers FROM acumatica_customers;
    SELECT COUNT(*) INTO v_active_customers FROM acumatica_customers WHERE customer_status = 'Active';
    SELECT COALESCE(SUM(balance), 0) INTO v_total_balance FROM acumatica_invoices WHERE status = 'Open';
    SELECT COUNT(*) INTO v_total_open_invoices FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
    SELECT COUNT(DISTINCT customer) INTO v_customers_with_debt FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
    SELECT COUNT(DISTINCT customer) INTO v_customers_with_overdue FROM acumatica_invoices WHERE status = 'Open' AND balance > 0 AND due_date < CURRENT_DATE;

    RETURN json_build_object(
      'total_customers', v_total_customers,
      'active_customers', v_active_customers,
      'total_balance', v_total_balance,
      'avg_balance', CASE WHEN v_customers_with_debt > 0 THEN v_total_balance / v_customers_with_debt ELSE 0 END,
      'customers_with_debt', v_customers_with_debt,
      'total_open_invoices', v_total_open_invoices,
      'customers_with_overdue', v_customers_with_overdue
    );
  END IF;

  IF v_only_positive_filter THEN
    SELECT COUNT(DISTINCT customer) INTO v_total_customers 
    FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
    
    SELECT COUNT(DISTINCT i.customer) INTO v_active_customers 
    FROM acumatica_invoices i
    JOIN acumatica_customers c ON c.customer_id = i.customer
    WHERE i.status = 'Open' AND i.balance > 0 AND c.customer_status = 'Active';
    
    SELECT COALESCE(SUM(balance), 0) INTO v_total_balance 
    FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
    
    SELECT COUNT(*) INTO v_total_open_invoices 
    FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
    
    v_customers_with_debt := v_total_customers;
    
    SELECT COUNT(DISTINCT customer) INTO v_customers_with_overdue 
    FROM acumatica_invoices WHERE status = 'Open' AND balance > 0 AND due_date < CURRENT_DATE;

    RETURN json_build_object(
      'total_customers', v_total_customers,
      'active_customers', v_active_customers,
      'total_balance', v_total_balance,
      'avg_balance', CASE WHEN v_total_customers > 0 THEN v_total_balance / v_total_customers ELSE 0 END,
      'customers_with_debt', v_customers_with_debt,
      'total_open_invoices', v_total_open_invoices,
      'customers_with_overdue', v_customers_with_overdue
    );
  END IF;

  WITH base_customers AS (
    SELECT c.customer_id, c.customer_status
    FROM acumatica_customers c
    WHERE
      (p_search IS NULL OR p_search = '' OR 
        c.customer_id ILIKE '%' || p_search || '%' OR
        c.customer_name ILIKE '%' || p_search || '%')
      AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
      AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
      AND (p_excluded_customer_ids IS NULL OR array_length(p_excluded_customer_ids, 1) IS NULL OR c.customer_id != ALL(p_excluded_customer_ids))
  ),
  customer_balances AS (
    SELECT 
      bc.customer_id,
      bc.customer_status,
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0) as balance,
      COUNT(CASE WHEN i.status = 'Open' AND i.balance > 0 THEN 1 END)::int as inv_count,
      BOOL_OR(i.status = 'Open' AND i.balance > 0 AND i.due_date < CURRENT_DATE) as is_overdue
    FROM base_customers bc
    LEFT JOIN acumatica_invoices i ON i.customer = bc.customer_id
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
    GROUP BY bc.customer_id, bc.customer_status
  ),
  filtered AS (
    SELECT * FROM customer_balances
    WHERE
      (p_balance_filter IS NULL OR p_balance_filter = 'all' OR
       (p_balance_filter = 'positive' AND balance > 0) OR
       (p_balance_filter = 'negative' AND balance < 0) OR
       (p_balance_filter = 'zero' AND balance = 0))
      AND (p_min_balance IS NULL OR balance >= p_min_balance)
      AND (p_max_balance IS NULL OR balance <= p_max_balance)
      AND (p_min_open_invoices IS NULL OR inv_count >= p_min_open_invoices)
      AND (p_max_open_invoices IS NULL OR inv_count <= p_max_open_invoices)
  )
  SELECT
    COUNT(*)::int,
    COUNT(CASE WHEN customer_status = 'Active' THEN 1 END)::int,
    COALESCE(SUM(balance), 0),
    COUNT(CASE WHEN balance > 0 THEN 1 END)::int,
    COALESCE(SUM(inv_count), 0),
    COUNT(CASE WHEN is_overdue THEN 1 END)::int
  INTO
    v_total_customers,
    v_active_customers,
    v_total_balance,
    v_customers_with_debt,
    v_total_open_invoices,
    v_customers_with_overdue
  FROM filtered;

  RETURN json_build_object(
    'total_customers', v_total_customers,
    'active_customers', v_active_customers,
    'total_balance', v_total_balance,
    'avg_balance', CASE WHEN v_customers_with_debt > 0 THEN v_total_balance / v_customers_with_debt ELSE 0 END,
    'customers_with_debt', v_customers_with_debt,
    'total_open_invoices', v_total_open_invoices,
    'customers_with_overdue', v_customers_with_overdue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_analytics(text, text, text, timestamptz, timestamptz, text[], text, numeric, numeric, int, int, text) TO anon;

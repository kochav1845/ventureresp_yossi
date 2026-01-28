/*
  # Fix Function Overloading Conflict for get_customers_with_balance
  
  1. Changes
    - Drop ALL versions of get_customers_with_balance function
    - Recreate the latest version with proper parameters
    - This fixes PostgreSQL function overloading ambiguity error
  
  2. Notes
    - The error occurred because there were multiple versions of the function
    - PostgreSQL couldn't determine which one to use
    - This migration ensures only ONE version exists
*/

-- Drop all versions of the function
DROP FUNCTION IF EXISTS get_customers_with_balance(
  text, text, text, text, text, int, int, timestamptz, timestamptz, text, numeric, numeric, int, int, numeric, numeric
);

DROP FUNCTION IF EXISTS get_customers_with_balance(
  text, text, text, text, text, int, int, timestamptz, timestamptz, text, numeric, numeric, int, int, numeric, numeric, text
);

-- Recreate the latest version
CREATE OR REPLACE FUNCTION get_customers_with_balance(
  p_search TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_country_filter TEXT DEFAULT 'all',
  p_sort_by TEXT DEFAULT 'customer_name',
  p_sort_order TEXT DEFAULT 'asc',
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_balance_filter TEXT DEFAULT 'all',
  p_min_balance NUMERIC DEFAULT NULL,
  p_max_balance NUMERIC DEFAULT NULL,
  p_min_open_invoices INT DEFAULT NULL,
  p_max_open_invoices INT DEFAULT NULL,
  p_min_invoice_amount NUMERIC DEFAULT NULL,
  p_max_invoice_amount NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  customer_id TEXT,
  customer_name TEXT,
  customer_status TEXT,
  email_address TEXT,
  phone1 TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  customer_class TEXT,
  terms TEXT,
  credit_limit NUMERIC,
  statement_cycle TEXT,
  parent_account TEXT,
  price_class TEXT,
  shipping_terms TEXT,
  acumatica_record_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  red_threshold_days INT,
  color_status TEXT,
  calculated_balance NUMERIC,
  open_invoice_count BIGINT,
  red_count BIGINT,
  yellow_count BIGINT,
  green_count BIGINT,
  max_days_overdue INT,
  exclude_from_payment_analytics BOOLEAN,
  exclude_from_customer_analytics BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(i.balance), 0) as total_balance,
      COUNT(*) as invoice_count,
      COUNT(*) FILTER (WHERE i.color_status = 'red') as red_cnt,
      COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange')) as yellow_cnt,
      COUNT(*) FILTER (WHERE i.color_status = 'green') as green_cnt,
      MAX(
        CASE
          WHEN i.due_date IS NOT NULL AND i.balance > 0
          THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
          ELSE 0
        END
      ) as max_overdue_days
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  ),
  date_filtered_customers AS (
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE
      (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
  )
  SELECT
    c.id,
    c.customer_id,
    c.customer_name,
    c.customer_status,
    c.email_address,
    NULL::text as phone1,
    NULL::text as address_line1,
    NULL::text as address_line2,
    c.city,
    c.billing_state as state,
    NULL::text as postal_code,
    c.country,
    c.customer_class,
    c.terms,
    c.credit_limit,
    c.statement_cycle_id as statement_cycle,
    c.parent_account,
    c.price_class_id as price_class,
    c.shipping_terms,
    c.note_id as acumatica_record_id,
    c.synced_at,
    c.created_at,
    c.updated_at,
    c.days_past_due_threshold as red_threshold_days,
    c.customer_color_status as color_status,
    COALESCE(cb.total_balance, 0)::numeric as calculated_balance,
    COALESCE(cb.invoice_count, 0)::bigint as open_invoice_count,
    COALESCE(cb.red_cnt, 0)::bigint as red_count,
    COALESCE(cb.yellow_cnt, 0)::bigint as yellow_count,
    COALESCE(cb.green_cnt, 0)::bigint as green_count,
    COALESCE(cb.max_overdue_days, 0)::int as max_days_overdue,
    COALESCE(c.exclude_from_payment_analytics, false) as exclude_from_payment_analytics,
    COALESCE(c.exclude_from_customer_analytics, false) as exclude_from_customer_analytics
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
    )
  ORDER BY
    CASE
      WHEN p_sort_by = 'customer_name' AND p_sort_order = 'asc' THEN c.customer_name
    END ASC NULLS LAST,
    CASE
      WHEN p_sort_by = 'customer_name' AND p_sort_order = 'desc' THEN c.customer_name
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN COALESCE(cb.total_balance, 0)
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN COALESCE(cb.total_balance, 0)
    END ASC NULLS LAST,
    CASE
      WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'desc' THEN COALESCE(cb.invoice_count, 0)
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'asc' THEN COALESCE(cb.invoice_count, 0)
    END ASC NULLS LAST,
    CASE
      WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'desc' THEN COALESCE(cb.max_overdue_days, 0)
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'asc' THEN COALESCE(cb.max_overdue_days, 0)
    END ASC NULLS LAST,
    CASE
      WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'desc' THEN c.days_past_due_threshold
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'asc' THEN c.days_past_due_threshold
    END ASC NULLS LAST,
    c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
/*
  # Fix Payment Date Column in get_customers_with_balance Function

  1. Issue
    - The customer_avg_collection_days CTE references p.date which doesn't exist
    - acumatica_payments table has 'application_date' column, not 'date'

  2. Fix
    - Change p.date to p.application_date in the CTE
    - Update all references to p.date in the calculation
*/

DROP FUNCTION IF EXISTS get_customers_with_balance(text,text,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric);

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
  exclude_from_customer_analytics BOOLEAN,
  avg_days_to_collect NUMERIC
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
  ),
  customer_avg_collection_days AS (
    SELECT
      p.customer_id,
      AVG(
        EXTRACT(EPOCH FROM (p.application_date::timestamp - i.date::timestamp)) / 86400
      )::numeric(10,1) as avg_days
    FROM payment_invoice_applications pia
    INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
    INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number
    WHERE pia.amount_paid > 0
      AND i.doc_type != 'Credit Memo'
      AND p.doc_type != 'Prepayment'
      AND p.application_date IS NOT NULL
      AND i.date IS NOT NULL
      AND p.application_date >= i.date
    GROUP BY p.customer_id
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
    c.days_from_invoice_threshold as red_threshold_days,
    c.customer_color_status as color_status,
    COALESCE(cb.total_balance, 0)::numeric as calculated_balance,
    COALESCE(cb.invoice_count, 0)::bigint as open_invoice_count,
    COALESCE(cb.red_cnt, 0)::bigint as red_count,
    COALESCE(cb.yellow_cnt, 0)::bigint as yellow_count,
    COALESCE(cb.green_cnt, 0)::bigint as green_count,
    COALESCE(cb.max_overdue_days, 0)::int as max_days_overdue,
    COALESCE(c.exclude_from_payment_analytics, false) as exclude_from_payment_analytics,
    COALESCE(c.exclude_from_customer_analytics, false) as exclude_from_customer_analytics,
    cacd.avg_days as avg_days_to_collect
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  LEFT JOIN customer_avg_collection_days cacd ON c.customer_id = cacd.customer_id
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
      WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'desc' THEN c.days_from_invoice_threshold
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'asc' THEN c.days_from_invoice_threshold
    END ASC NULLS LAST,
    CASE
      WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'desc' THEN cacd.avg_days
    END DESC NULLS LAST,
    CASE
      WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'asc' THEN cacd.avg_days
    END ASC NULLS LAST,
    c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

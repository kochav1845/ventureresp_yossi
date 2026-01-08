/*
  # Add Invoice Date Range Filter to Customer Functions

  1. Updates
    - Modify `get_customers_with_balance` to add p_date_from and p_date_to parameters
    - Filter customers who have invoices created within the date range
    - Modify `get_customers_with_balance_count` to match

  2. Purpose
    - Allow filtering customers by invoice date rather than customer sync date
    - Shows customers who have new invoices within a specific period
*/

CREATE OR REPLACE FUNCTION get_customers_with_balance(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_country_filter text DEFAULT NULL,
  p_sort_by text DEFAULT 'customer_name',
  p_sort_order text DEFAULT 'asc',
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  customer_id text,
  customer_name text,
  customer_status text,
  email_address text,
  phone1 text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  customer_class text,
  terms text,
  credit_limit numeric,
  statement_cycle text,
  parent_account text,
  price_class text,
  shipping_terms text,
  acumatica_record_id text,
  synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  red_threshold_days integer,
  color_status text,
  calculated_balance numeric,
  open_invoice_count bigint,
  red_count bigint,
  yellow_count bigint,
  green_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
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
      COUNT(*) FILTER (WHERE i.color_status = 'green') as green_cnt
    FROM acumatica_invoices i
    WHERE i.balance > 0
    GROUP BY i.customer
  ),
  date_filtered_customers AS (
    SELECT DISTINCT i.customer_id
    FROM acumatica_invoices i
    WHERE
      (p_date_from IS NULL OR i.date >= p_date_from)
      AND (p_date_to IS NULL OR i.date <= p_date_to)
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
    COALESCE(cb.green_cnt, 0)::bigint as green_count
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
      OR c.customer_id IN (SELECT customer_id FROM date_filtered_customers)
    )
  ORDER BY
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN COALESCE(cb.total_balance, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN COALESCE(cb.total_balance, 0) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoices' AND p_sort_order = 'desc' THEN COALESCE(cb.invoice_count, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoices' AND p_sort_order = 'asc' THEN COALESCE(cb.invoice_count, 0) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_id' AND p_sort_order = 'desc' THEN c.customer_id END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_id' AND p_sort_order = 'asc' THEN c.customer_id END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'synced_at' AND p_sort_order = 'desc' THEN c.synced_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'synced_at' AND p_sort_order = 'asc' THEN c.synced_at END ASC NULLS LAST,
    c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_customers_with_balance_count(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_country_filter text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result bigint;
BEGIN
  WITH date_filtered_customers AS (
    SELECT DISTINCT i.customer_id
    FROM acumatica_invoices i
    WHERE
      (p_date_from IS NULL OR i.date >= p_date_from)
      AND (p_date_to IS NULL OR i.date <= p_date_to)
  )
  SELECT COUNT(*)
  INTO result
  FROM acumatica_customers c
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
      OR c.customer_id IN (SELECT customer_id FROM date_filtered_customers)
    );

  RETURN result;
END;
$$;

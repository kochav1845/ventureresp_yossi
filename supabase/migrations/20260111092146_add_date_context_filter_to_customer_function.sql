/*
  # Add Date Range Context to Customer Function

  1. Changes
    - Add p_date_context parameter to get_customers_with_balance function
    - Support filtering by 'invoice_date', 'customer_added', and 'balance_date'
    - 'invoice_date': Filter customers by invoice creation dates (existing behavior)
    - 'customer_added': Filter customers by when they were synced to the system
    - 'balance_date': Filter customers who had a balance change in the date range

  2. Notes
    - This fixes the issue where "New customers added in this date range" was actually filtering by invoice dates
*/

CREATE OR REPLACE FUNCTION get_customers_with_balance(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_country_filter text DEFAULT 'all',
  p_sort_by text DEFAULT 'customer_name',
  p_sort_order text DEFAULT 'asc',
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
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
RETURNS TABLE(
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
  red_threshold_days int,
  color_status text,
  calculated_balance numeric,
  open_invoice_count bigint,
  red_count bigint,
  yellow_count bigint,
  green_count bigint,
  max_days_overdue int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    COALESCE(cb.max_overdue_days, 0)::int as max_days_overdue
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
    CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'desc' THEN COALESCE(cb.max_overdue_days, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'asc' THEN COALESCE(cb.max_overdue_days, 0) END ASC NULLS LAST,
    c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

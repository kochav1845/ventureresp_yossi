/*
  # Optimize API customers function

  1. New Indexes
    - Covering index on acumatica_invoices for (customer, type, balance) WHERE status = 'Open' AND balance > 0
      to speed up the balance aggregation

  2. Modified Functions
    - `get_api_customers` - Rewritten to avoid double CTE scan; uses window function for total_count instead

  3. Purpose
    - Previous version timed out on edge function (>8s) due to double scan of filtered CTE
    - New version uses COUNT(*) OVER() window function for single pass
*/

CREATE INDEX IF NOT EXISTS idx_invoices_open_balance_agg
ON acumatica_invoices (customer, type, balance)
WHERE status = 'Open' AND balance > 0;

CREATE OR REPLACE FUNCTION get_api_customers(
  p_search text DEFAULT '',
  p_status text DEFAULT '',
  p_customer_class text DEFAULT '',
  p_country text DEFAULT '',
  p_sort_by text DEFAULT 'customer_name',
  p_sort_asc boolean DEFAULT true,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  customer_id text,
  customer_name text,
  customer_class text,
  customer_status text,
  general_email text,
  billing_email text,
  country text,
  city text,
  billing_state text,
  terms text,
  credit_limit numeric,
  parent_account text,
  account_name text,
  invoice_balance numeric,
  open_invoice_count bigint,
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH balances AS (
    SELECT
      i.customer AS cust_id,
      SUM(i.balance) FILTER (WHERE i.type IS DISTINCT FROM 'Credit Memo') AS total_balance,
      COUNT(*) FILTER (WHERE i.type IS DISTINCT FROM 'Credit Memo') AS inv_count
    FROM acumatica_invoices i
    WHERE i.status = 'Open' AND i.balance > 0
    GROUP BY i.customer
  )
  SELECT
    c.customer_id,
    c.customer_name,
    c.customer_class,
    c.customer_status,
    c.general_email,
    c.billing_email,
    c.country,
    c.city,
    c.billing_state,
    c.terms,
    c.credit_limit,
    c.parent_account,
    c.account_name,
    ROUND(COALESCE(b.total_balance, 0), 2) AS invoice_balance,
    COALESCE(b.inv_count, 0) AS open_invoice_count,
    COUNT(*) OVER() AS total_count
  FROM acumatica_customers c
  LEFT JOIN balances b ON b.cust_id = c.customer_id
  WHERE
    (p_search = '' OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR c.general_email ILIKE '%' || p_search || '%')
    AND (p_status = '' OR c.customer_status = p_status)
    AND (p_customer_class = '' OR c.customer_class = p_customer_class)
    AND (p_country = '' OR c.country = p_country)
  ORDER BY
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_asc THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND NOT p_sort_asc THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND NOT p_sort_asc THEN COALESCE(b.total_balance, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_asc THEN COALESCE(b.total_balance, 0) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND NOT p_sort_asc THEN COALESCE(b.inv_count, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND p_sort_asc THEN COALESCE(b.inv_count, 0) END ASC NULLS LAST,
    c.customer_name ASC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

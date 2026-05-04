/*
  # Create API customers list function with computed balances

  1. New Functions
    - `get_api_customers` - Lists customers with balance computed from open invoices
      - Supports search by name, ID, email
      - Supports filter by status, customer_class, country
      - Computed balance from open invoices (not the stale customer.balance field)
      - Supports sorting by customer_name, balance, open_invoice_count
      - Pagination via limit/offset
      - Returns total count for pagination

  2. Purpose
    - Replaces direct acumatica_customers queries in the GPT API
    - Ensures balance shown is always accurate (from invoices)
*/

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
      SUM(i.balance) FILTER (WHERE COALESCE(i.type, '') != 'Credit Memo') AS total_balance,
      COUNT(*) FILTER (WHERE COALESCE(i.type, '') != 'Credit Memo') AS inv_count
    FROM acumatica_invoices i
    WHERE i.status = 'Open' AND i.balance > 0
    GROUP BY i.customer
  ),
  filtered AS (
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
      COALESCE(b.inv_count, 0) AS open_invoice_count
    FROM acumatica_customers c
    LEFT JOIN balances b ON b.cust_id = c.customer_id
    WHERE
      (p_search = '' OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR c.general_email ILIKE '%' || p_search || '%')
      AND (p_status = '' OR c.customer_status = p_status)
      AND (p_customer_class = '' OR c.customer_class = p_customer_class)
      AND (p_country = '' OR c.country = p_country)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.customer_id,
    f.customer_name,
    f.customer_class,
    f.customer_status,
    f.general_email,
    f.billing_email,
    f.country,
    f.city,
    f.billing_state,
    f.terms,
    f.credit_limit,
    f.parent_account,
    f.account_name,
    f.invoice_balance,
    f.open_invoice_count,
    counted.cnt AS total_count
  FROM filtered f, counted
  ORDER BY
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_asc THEN f.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND NOT p_sort_asc THEN f.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND NOT p_sort_asc THEN f.invoice_balance END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_asc THEN f.invoice_balance END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND NOT p_sort_asc THEN f.open_invoice_count END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND p_sort_asc THEN f.open_invoice_count END ASC NULLS LAST,
    f.customer_name ASC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

/*
  # Create API customer balances function
  
  1. New Functions
    - `get_api_customer_balances` - Computes real customer balances from open invoices
      - Aggregates balance from acumatica_invoices where status = 'Open'
      - Excludes Draft invoices
      - Supports search, sorting by balance, limit/offset pagination
      - Returns customer info plus computed invoice_balance and open_invoice_count
    - `get_api_total_outstanding` - Returns total outstanding balance across all customers
  
  2. Purpose
    - The acumatica_customers.balance column is stale and not updated by sync
    - Real balances must be computed from open invoices
    - Used by GPT data API endpoints for accurate reporting
*/

CREATE OR REPLACE FUNCTION get_api_customer_balances(
  p_search text DEFAULT '',
  p_sort_by text DEFAULT 'balance',
  p_sort_asc boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  customer_id text,
  customer_name text,
  customer_class text,
  customer_status text,
  general_email text,
  credit_limit numeric,
  terms text,
  invoice_balance numeric,
  open_invoice_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH balances AS (
    SELECT
      i.customer AS cust_id,
      SUM(i.balance) AS total_balance,
      COUNT(*) AS inv_count
    FROM acumatica_invoices i
    WHERE i.status = 'Open'
      AND i.balance > 0
      AND COALESCE(i.type, '') != 'Credit Memo'
    GROUP BY i.customer
    HAVING SUM(i.balance) > 0
  )
  SELECT
    c.customer_id,
    c.customer_name,
    c.customer_class,
    c.customer_status,
    c.general_email,
    c.credit_limit,
    c.terms,
    ROUND(COALESCE(b.total_balance, 0), 2) AS invoice_balance,
    COALESCE(b.inv_count, 0) AS open_invoice_count
  FROM acumatica_customers c
  INNER JOIN balances b ON b.cust_id = c.customer_id
  WHERE (
    p_search = '' 
    OR c.customer_name ILIKE '%' || p_search || '%'
    OR c.customer_id ILIKE '%' || p_search || '%'
  )
  ORDER BY
    CASE WHEN p_sort_by = 'balance' AND NOT p_sort_asc THEN b.total_balance END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_asc THEN b.total_balance END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND NOT p_sort_asc THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_asc THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND NOT p_sort_asc THEN b.inv_count END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'open_invoice_count' AND p_sort_asc THEN b.inv_count END ASC NULLS LAST,
    b.total_balance DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION get_api_total_outstanding()
RETURNS TABLE (
  total_balance numeric,
  customer_count bigint,
  invoice_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ROUND(SUM(i.balance), 2) AS total_balance,
    COUNT(DISTINCT i.customer) AS customer_count,
    COUNT(*) AS invoice_count
  FROM acumatica_invoices i
  WHERE i.status = 'Open'
    AND i.balance > 0
    AND COALESCE(i.type, '') != 'Credit Memo';
$$;

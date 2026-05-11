/*
  # Create fast customer unpaid summary function

  1. New Function
    - `get_customers_unpaid_summary` - Returns customers with unpaid invoices
      - Groups invoices by customer server-side
      - Joins with acumatica_customers for name/email
      - Supports date range filtering, search, sorting, pagination
      - Returns: customer_id, customer_name, email, total_balance, invoice_count, total_amount

  2. Performance
    - Single query instead of 11+ paginated client-side fetches
    - Server-side filtering, sorting, and grouping
    - Should complete in milliseconds
*/

CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_min_balance numeric DEFAULT 0,
  p_sort_by text DEFAULT 'name',
  p_sort_order text DEFAULT 'asc',
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  customer_id text,
  customer_name text,
  email text,
  total_balance numeric,
  total_amount numeric,
  invoice_count bigint
)
LANGUAGE sql
STABLE
AS $function$
  WITH unpaid AS (
    SELECT
      i.customer,
      SUM(i.balance) as total_balance,
      SUM(i.amount) as total_amount,
      COUNT(*) as invoice_count
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND (p_date_from IS NULL OR i.date >= p_date_from)
      AND (p_date_to IS NULL OR i.date <= p_date_to)
    GROUP BY i.customer
    HAVING SUM(i.balance) >= p_min_balance
  )
  SELECT
    u.customer as customer_id,
    COALESCE(c.customer_name, 'Customer ' || u.customer) as customer_name,
    COALESCE(c.billing_email, c.general_email, '') as email,
    u.total_balance,
    u.total_amount,
    u.invoice_count
  FROM unpaid u
  LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
  WHERE (
    p_search IS NULL
    OR c.customer_name ILIKE '%' || p_search || '%'
    OR c.customer_id ILIKE '%' || p_search || '%'
    OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%'
  )
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN u.total_balance END ASC,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN u.total_balance END DESC,
    CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'asc' THEN u.invoice_count END ASC,
    CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'desc' THEN u.invoice_count END DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

-- Also create a count function for pagination
CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary_count(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_min_balance numeric DEFAULT 0
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $function$
  WITH unpaid AS (
    SELECT
      i.customer,
      SUM(i.balance) as total_balance
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND (p_date_from IS NULL OR i.date >= p_date_from)
      AND (p_date_to IS NULL OR i.date <= p_date_to)
    GROUP BY i.customer
    HAVING SUM(i.balance) >= p_min_balance
  )
  SELECT COUNT(*)::bigint
  FROM unpaid u
  LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
  WHERE (
    p_search IS NULL
    OR c.customer_name ILIKE '%' || p_search || '%'
    OR c.customer_id ILIKE '%' || p_search || '%'
    OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%'
  );
$function$;

-- Function to get invoices for a specific customer (lazy load)
CREATE OR REPLACE FUNCTION public.get_customer_unpaid_invoices(
  p_customer_id text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  reference_number text,
  invoice_date date,
  due_date date,
  amount numeric,
  balance numeric,
  status text,
  description text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    i.id,
    i.reference_number,
    i.date as invoice_date,
    i.due_date,
    COALESCE(i.amount, 0) as amount,
    COALESCE(i.balance, 0) as balance,
    i.status,
    COALESCE(i.description, '') as description
  FROM acumatica_invoices i
  WHERE i.customer = p_customer_id
    AND i.balance > 0
    AND (p_date_from IS NULL OR i.date >= p_date_from)
    AND (p_date_to IS NULL OR i.date <= p_date_to)
  ORDER BY i.date DESC, i.reference_number;
$function$;

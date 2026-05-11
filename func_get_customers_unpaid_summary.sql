CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_min_balance numeric DEFAULT 0, p_sort_by text DEFAULT 'name'::text, p_sort_order text DEFAULT 'asc'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id text, customer_name text, email text, total_balance numeric, total_amount numeric, invoice_count bigint)
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
$function$

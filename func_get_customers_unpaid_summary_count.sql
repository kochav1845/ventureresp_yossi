CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary_count(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_min_balance numeric DEFAULT 0)
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
$function$

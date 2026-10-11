CREATE OR REPLACE FUNCTION public.get_customers_with_balance_count(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT 'all'::text, p_country_filter text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_balance_filter text DEFAULT 'all'::text, p_min_balance numeric DEFAULT NULL::numeric, p_max_balance numeric DEFAULT NULL::numeric, p_min_open_invoices integer DEFAULT NULL::integer, p_max_open_invoices integer DEFAULT NULL::integer, p_min_invoice_amount numeric DEFAULT NULL::numeric, p_max_invoice_amount numeric DEFAULT NULL::numeric, p_exclude_credit_memos boolean DEFAULT false, p_date_context text DEFAULT 'invoice_date'::text, p_min_days_overdue integer DEFAULT NULL::integer, p_max_days_overdue integer DEFAULT NULL::integer, p_test_customers boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
v_count bigint;
v_has_filter boolean;
BEGIN

v_has_filter := (
p_date_from IS NOT NULL OR p_date_to IS NOT NULL
OR p_min_days_overdue IS NOT NULL OR p_max_days_overdue IS NOT NULL
OR p_min_invoice_amount IS NOT NULL OR p_max_invoice_amount IS NOT NULL
);

SELECT COUNT(*) INTO v_count
FROM (
SELECT c.customer_id
FROM acumatica_customers c
LEFT JOIN (
SELECT
i.customer,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
COALESCE(
SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END) -
SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
0
) as net_balance_amt,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as invoice_count,
MAX(
CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) ELSE 0 END
) as max_overdue_days,
BOOL_OR(
CASE
WHEN p_date_from IS NULL AND p_date_to IS NULL THEN true
WHEN p_date_context = 'invoice_date'
THEN (i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
WHEN p_date_context = 'balance_date'
THEN (i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
ELSE false
END
) as passes_date_filter,
CASE WHEN v_has_filter THEN
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')
AND (
(p_date_from IS NULL AND p_date_to IS NULL)
OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
)
AND (
(p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL)
OR (COALESCE(i.due_date, i.date) IS NOT NULL AND GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) >= COALESCE(p_min_days_overdue, 0) AND GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) <= COALESCE(p_max_days_overdue, 999999))
)
AND (p_min_invoice_amount IS NULL OR i.amount >= p_min_invoice_amount)
AND (p_max_invoice_amount IS NULL OR i.amount <= p_max_invoice_amount)
)
ELSE
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo'))
END as filtered_inv_count
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
) cb ON c.customer_id = cb.customer
WHERE
c.is_test_customer = p_test_customers
AND (p_search IS NULL OR p_search = '' OR
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
OR (p_date_context = 'customer_added' AND c.synced_at >= COALESCE(p_date_from, c.synced_at) AND c.synced_at <= COALESCE(p_date_to, c.synced_at))
OR (p_date_context IN ('invoice_date', 'balance_date') AND COALESCE(cb.passes_date_filter, false))
)
AND (
p_balance_filter = 'all' OR
(p_balance_filter = 'positive' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR
(p_balance_filter = 'negative' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR
(p_balance_filter = 'zero' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0)
)
AND (p_min_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
AND (p_max_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
AND (p_min_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) >= p_min_days_overdue)
AND (p_max_days_overdue IS NULL OR COALESCE(cb.filtered_inv_count, 0) > 0)
AND ((p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL) OR COALESCE(cb.filtered_inv_count, 0) > 0)
) sub;

RETURN v_count;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_customer_invoices_advanced(p_customer_id text, p_filter text, p_date_from date, p_date_to date, p_amount_min numeric, p_amount_max numeric, p_color_status text, p_invoice_status text, p_sort_by text, p_sort_order text, p_limit integer, p_offset integer, p_exclude_credit_memos boolean DEFAULT false)
 RETURNS TABLE(id uuid, reference_number text, type text, date date, due_date date, status text, amount numeric, balance numeric, description text, color_status text, days_overdue integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
RETURN QUERY
SELECT
i.id,
i.reference_number,
i.type,
i.date,
i.due_date,
i.status,
CASE
WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.amount
ELSE i.amount
END AS amount,
CASE
WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.balance
ELSE i.balance
END AS balance,
i.description,
i.color_status,
CASE
WHEN i.due_date IS NOT NULL AND i.balance > 0
THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
ELSE 0
END AS days_overdue
FROM acumatica_invoices i
WHERE
i.customer = p_customer_id
AND (
p_filter = 'all' OR
(p_filter = 'open' AND i.balance > 0 AND i.status IN ('Open', 'Balanced')) OR
(p_filter = 'balanced' AND i.balance > 0 AND i.status NOT IN ('Open', 'Balanced')) OR
(p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
)
AND (NOT p_exclude_credit_memos OR i.type NOT IN ('Credit Memo', 'Credit WO'))
AND (p_date_from IS NULL OR i.date >= p_date_from)
AND (p_date_to IS NULL OR i.date <= p_date_to)
AND (p_amount_min IS NULL OR i.amount >= p_amount_min)
AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status)
ORDER BY
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN i.date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN i.date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'desc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END DESC NULLS LAST,
CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'asc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END ASC NULLS LAST,
i.date DESC
LIMIT p_limit
OFFSET p_offset;
END;
$function$

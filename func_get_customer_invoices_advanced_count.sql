CREATE OR REPLACE FUNCTION public.get_customer_invoices_advanced_count(p_customer_id text, p_filter text, p_date_from date, p_date_to date, p_amount_min numeric, p_amount_max numeric, p_color_status text, p_invoice_status text, p_exclude_credit_memos boolean DEFAULT false)
 RETURNS TABLE(total_count bigint, total_amount numeric, total_balance numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
RETURN QUERY
SELECT
COUNT(*)::BIGINT AS total_count,
COALESCE(SUM(
CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.amount ELSE i.amount END
), 0)::NUMERIC AS total_amount,
COALESCE(SUM(
CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.balance ELSE i.balance END
), 0)::NUMERIC AS total_balance
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
AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status);
END;
$function$

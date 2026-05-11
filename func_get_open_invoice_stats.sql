CREATE OR REPLACE FUNCTION public.get_open_invoice_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
SELECT json_build_object(
'total_count', count(*),
'invoice_count', count(*) FILTER (WHERE type = 'Invoice'),
'credit_memo_count', count(*) FILTER (WHERE type = 'Credit Memo'),
'debit_memo_count', count(*) FILTER (WHERE type = 'Debit Memo'),
'total_amount', coalesce(round(sum(amount)::numeric, 2), 0),
'total_balance', coalesce(round(sum(balance)::numeric, 2), 0),
'invoice_balance', coalesce(round(sum(balance) FILTER (WHERE type = 'Invoice')::numeric, 2), 0),
'credit_memo_balance', coalesce(round(sum(balance) FILTER (WHERE type = 'Credit Memo')::numeric, 2), 0)
)
FROM acumatica_invoices
WHERE status = 'Open';
$function$

CREATE OR REPLACE FUNCTION public.get_invoice_breakdown_by_date(p_year integer, p_month integer)
 RETURNS TABLE(day_date date, day_label text, invoice_type text, invoice_status text, invoice_count bigint, total_amount numeric, total_balance numeric, avg_amount numeric)
 LANGUAGE sql
 STABLE
AS $function$
SELECT
i.date as day_date,
to_char(i.date, 'Mon DD') as day_label,
i.type as invoice_type,
i.status as invoice_status,
COUNT(*)::bigint as invoice_count,
COALESCE(SUM(i.amount), 0)::numeric as total_amount,
COALESCE(SUM(i.balance), 0)::numeric as total_balance,
COALESCE(AVG(i.amount), 0)::numeric as avg_amount
FROM acumatica_invoices i
WHERE i.date >= make_date(p_year, p_month, 1)
AND i.date < (make_date(p_year, p_month, 1) + interval '1 month')::date
GROUP BY i.date, i.type, i.status
ORDER BY i.date DESC, i.type, i.status;
$function$

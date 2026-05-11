CREATE OR REPLACE FUNCTION public.get_invoice_counts_by_type(p_start_date text, p_end_date text)
 RETURNS TABLE(invoice_type text, type_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
SELECT
type AS invoice_type,
count(*) AS type_count
FROM acumatica_invoices
WHERE date >= p_start_date::date
AND date <= p_end_date::date
GROUP BY type
ORDER BY type_count DESC;
$function$

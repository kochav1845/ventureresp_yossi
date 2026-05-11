CREATE OR REPLACE FUNCTION public.get_customer_invoices_count(p_customer_id text, p_filter text DEFAULT 'all'::text)
 RETURNS TABLE(total_count bigint, open_count bigint, paid_count bigint, balanced_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
SELECT
COUNT(*)::bigint as total_count,
COUNT(*) FILTER (WHERE balance > 0 AND status = 'Open')::bigint as open_count,
COUNT(*) FILTER (WHERE balance = 0 AND status != 'Voided')::bigint as paid_count,
COUNT(*) FILTER (WHERE balance > 0 AND status != 'Open')::bigint as balanced_count
FROM acumatica_invoices
WHERE customer = p_customer_id;
END;
$function$

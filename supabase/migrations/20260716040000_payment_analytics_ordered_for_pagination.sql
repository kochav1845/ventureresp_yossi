-- Add a stable ORDER BY so calculate-payment-analytics can safely paginate this
-- RPC past PostgREST's ~1000-row cap (without it, a full-year fetch was capped at
-- 1000 rows, so only the first ~2 months ever landed in cached_payment_analytics).
CREATE OR REPLACE FUNCTION public.get_payments_for_analytics(p_start_date date, p_end_date date, p_excluded_types text[])
 RETURNS TABLE(effective_date text, payment_amount text, customer_id text, type text, payment_method text, status text)
 LANGUAGE sql
 STABLE
AS $function$
SELECT
p.effective_date::text,
p.payment_amount::text,
p.customer_id,
p.type,
p.payment_method,
p.status
FROM acumatica_payments p
WHERE p.effective_date >= p_start_date
AND p.effective_date <= p_end_date
AND p.type != ALL(p_excluded_types)
ORDER BY p.id;
$function$;

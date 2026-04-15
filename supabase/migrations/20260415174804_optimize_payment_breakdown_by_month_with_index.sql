/*
  # Optimize get_payment_breakdown_by_month to use expression index

  1. Changes
    - Rewrite function to use `payment_effective_date()` helper which has an expression index
    - Allows index scan for date range filters instead of full table scan

  2. Why
    - Same performance issue as get_payment_breakdown_by_date
    - Without the indexed expression, Postgres does a sequential scan on all rows
*/

CREATE OR REPLACE FUNCTION public.get_payment_breakdown_by_month(p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL)
RETURNS TABLE(
  month_key text,
  month_label text,
  payment_type text,
  payment_status text,
  payment_count bigint,
  total_amount numeric,
  avg_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(public.payment_effective_date(p.doc_date, p.application_date), 'YYYY-MM') AS month_key,
    to_char(public.payment_effective_date(p.doc_date, p.application_date), 'Mon YYYY') AS month_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE public.payment_effective_date(p.doc_date, p.application_date) IS NOT NULL
    AND (p_start_date IS NULL OR public.payment_effective_date(p.doc_date, p.application_date) >= p_start_date)
    AND (p_end_date IS NULL OR public.payment_effective_date(p.doc_date, p.application_date) <= p_end_date)
  GROUP BY
    to_char(public.payment_effective_date(p.doc_date, p.application_date), 'YYYY-MM'),
    to_char(public.payment_effective_date(p.doc_date, p.application_date), 'Mon YYYY'),
    p.type,
    p.status
  ORDER BY month_key DESC, payment_type, payment_status;
END;
$$;
/*
  # Optimize get_payment_breakdown_by_date to use expression index

  1. Changes
    - Rewrite function to use `payment_effective_date()` helper which has an expression index
    - This allows Postgres to use the index for the date range filter instead of a full table scan

  2. Why
    - The function was taking 7+ seconds due to sequential scan on wide rows
    - Using the indexed expression allows an index scan, drastically reducing I/O
*/

CREATE OR REPLACE FUNCTION public.get_payment_breakdown_by_date(p_year integer, p_month integer)
RETURNS TABLE(
  day_date date,
  day_label text,
  payment_type text,
  payment_status text,
  payment_count bigint,
  total_amount numeric,
  avg_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  RETURN QUERY
  SELECT
    public.payment_effective_date(p.doc_date, p.application_date) AS day_date,
    to_char(public.payment_effective_date(p.doc_date, p.application_date), 'Mon DD, YYYY') AS day_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE public.payment_effective_date(p.doc_date, p.application_date) >= v_start
    AND public.payment_effective_date(p.doc_date, p.application_date) <= v_end
  GROUP BY
    public.payment_effective_date(p.doc_date, p.application_date),
    p.type,
    p.status
  ORDER BY day_date DESC, payment_type, payment_status;
END;
$$;
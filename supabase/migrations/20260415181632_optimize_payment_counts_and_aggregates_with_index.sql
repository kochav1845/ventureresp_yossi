/*
  # Optimize get_payment_counts_by_type and get_filtered_payment_aggregates

  1. Changes
    - Rewrite `get_payment_counts_by_type` to use `payment_effective_date()` indexed expression
    - Rewrite `get_filtered_payment_aggregates` to use `payment_effective_date()` indexed expression
    - Add composite index on (type, effective_date) for filtered queries

  2. Why
    - `get_payment_counts_by_type` was taking 9.6s due to sequential scan with COALESCE
    - `get_filtered_payment_aggregates` was taking 5s for the same reason
    - Using the indexed `payment_effective_date()` function enables index scans
*/

CREATE INDEX IF NOT EXISTS idx_payments_type_effective_date
  ON acumatica_payments (type, (public.payment_effective_date(doc_date, application_date)));

CREATE OR REPLACE FUNCTION public.get_payment_counts_by_type(p_start_date text, p_end_date text)
RETURNS TABLE(payment_type text, type_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    type AS payment_type,
    count(*) AS type_count
  FROM acumatica_payments
  WHERE public.payment_effective_date(doc_date, application_date) >= p_start_date::timestamptz::date
    AND public.payment_effective_date(doc_date, application_date) <= p_end_date::timestamptz::date
  GROUP BY type
  ORDER BY type_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_filtered_payment_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_has_applications text DEFAULT NULL,
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE(agg_year integer, agg_month integer, total_amount numeric, payment_count bigint, unique_customers bigint)
LANGUAGE sql
STABLE
AS $$
  WITH filtered_payments AS (
    SELECT
      p.id,
      EXTRACT(YEAR FROM public.payment_effective_date(p.doc_date, p.application_date))::int AS yr,
      EXTRACT(MONTH FROM public.payment_effective_date(p.doc_date, p.application_date))::int AS mo,
      p.payment_amount::numeric,
      p.customer_id
    FROM acumatica_payments p
    WHERE
      p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
      AND (p_status IS NULL OR p.status = p_status)
      AND (p_type IS NULL OR p.type = p_type)
      AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
      AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
      AND (
        p_has_applications IS NULL
        OR (p_has_applications = 'has_applications' AND EXISTS (
          SELECT 1 FROM payment_invoice_applications pia WHERE pia.payment_id = p.id
        ))
        OR (p_has_applications = 'no_applications' AND NOT EXISTS (
          SELECT 1 FROM payment_invoice_applications pia WHERE pia.payment_id = p.id
        ))
      )
      AND (
        p_period_type = 'yearly'
        OR (p_period_type = 'monthly' AND EXTRACT(YEAR FROM public.payment_effective_date(p.doc_date, p.application_date)) = p_year)
      )
  )
  SELECT
    fp.yr AS agg_year,
    CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END AS agg_month,
    COALESCE(SUM(fp.payment_amount), 0) AS total_amount,
    COUNT(*) AS payment_count,
    COUNT(DISTINCT fp.customer_id) AS unique_customers
  FROM filtered_payments fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
  ORDER BY fp.yr DESC, agg_month ASC;
$$;
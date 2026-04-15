/*
  # Fix get_filtered_payment_aggregates - prevent regression on default path

  1. Changes
    - Use two separate query paths: one for has_applications filter, one without
    - This prevents the LEFT JOIN from materializing when not needed
    - Default path stays fast (~276ms), has_applications path is optimized separately

  2. Why
    - Previous change caused regression on default path (276ms -> 2.5s)
    - The CTE was being materialized even when p_has_applications was NULL
*/

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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_year_start date;
  v_year_end date;
BEGIN
  IF p_period_type = 'monthly' AND p_year IS NOT NULL THEN
    v_year_start := make_date(p_year, 1, 1);
    v_year_end := make_date(p_year, 12, 31);
  END IF;

  IF p_has_applications IS NOT NULL THEN
    RETURN QUERY
    WITH payments_with_apps AS (
      SELECT DISTINCT pia.payment_id
      FROM payment_invoice_applications pia
    ),
    filtered_payments AS (
      SELECT
        p.id,
        EXTRACT(YEAR FROM public.payment_effective_date(p.doc_date, p.application_date))::int AS yr,
        EXTRACT(MONTH FROM public.payment_effective_date(p.doc_date, p.application_date))::int AS mo,
        p.payment_amount::numeric,
        p.customer_id
      FROM acumatica_payments p
      LEFT JOIN payments_with_apps pwa ON pwa.payment_id = p.id
      WHERE
        p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_type IS NULL OR p.type = p_type)
        AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
        AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
        AND (
          (p_has_applications = 'has_applications' AND pwa.payment_id IS NOT NULL)
          OR (p_has_applications = 'no_applications' AND pwa.payment_id IS NULL)
        )
        AND (
          p_period_type = 'yearly'
          OR (
            v_year_start IS NOT NULL
            AND public.payment_effective_date(p.doc_date, p.application_date) >= v_year_start
            AND public.payment_effective_date(p.doc_date, p.application_date) <= v_year_end
          )
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
  ELSE
    RETURN QUERY
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
          p_period_type = 'yearly'
          OR (
            v_year_start IS NOT NULL
            AND public.payment_effective_date(p.doc_date, p.application_date) >= v_year_start
            AND public.payment_effective_date(p.doc_date, p.application_date) <= v_year_end
          )
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
  END IF;
END;
$$;
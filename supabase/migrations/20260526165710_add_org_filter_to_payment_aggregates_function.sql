/*
  # Add org filter to get_filtered_payment_aggregates

  Add explicit organization_id filtering inside the function body
  to maintain data isolation now that it's SECURITY DEFINER.
*/

-- Drop both overloads and recreate with org filter
DROP FUNCTION IF EXISTS get_filtered_payment_aggregates(text, integer, text, text, text, text, text[]);
DROP FUNCTION IF EXISTS get_filtered_payment_aggregates(text, integer, text, text, text, text, text[], text[]);

CREATE FUNCTION get_filtered_payment_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_has_applications text DEFAULT NULL,
  p_excluded_customers text[] DEFAULT '{}',
  p_included_customers text[] DEFAULT '{}'
)
RETURNS TABLE(
  agg_year integer,
  agg_month integer,
  total_amount numeric,
  payment_count bigint,
  unique_customers bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
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
        EXTRACT(YEAR FROM p.effective_date)::int AS yr,
        EXTRACT(MONTH FROM p.effective_date)::int AS mo,
        p.payment_amount::numeric AS amt,
        p.customer_id AS cid
      FROM acumatica_payments p
      LEFT JOIN payments_with_apps pwa ON pwa.payment_id = p.id
      WHERE
        p.organization_id = v_org_id
        AND p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_type IS NULL OR p.type = p_type)
        AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
        AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
        AND (p_included_customers = '{}' OR p.customer_id = ANY(p_included_customers))
        AND (
          (p_has_applications = 'has_applications' AND pwa.payment_id IS NOT NULL)
          OR (p_has_applications = 'no_applications' AND pwa.payment_id IS NULL)
        )
        AND (
          p_period_type = 'yearly'
          OR (v_year_start IS NOT NULL AND p.effective_date >= v_year_start AND p.effective_date <= v_year_end)
        )
    )
    SELECT
      fp.yr,
      CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END,
      COALESCE(SUM(fp.amt), 0),
      COUNT(*),
      COUNT(DISTINCT fp.cid)
    FROM filtered_payments fp
    GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
    ORDER BY fp.yr DESC, 2 ASC;
  ELSE
    RETURN QUERY
    WITH filtered_payments AS (
      SELECT
        p.id,
        EXTRACT(YEAR FROM p.effective_date)::int AS yr,
        EXTRACT(MONTH FROM p.effective_date)::int AS mo,
        p.payment_amount::numeric AS amt,
        p.customer_id AS cid
      FROM acumatica_payments p
      WHERE
        p.organization_id = v_org_id
        AND p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_type IS NULL OR p.type = p_type)
        AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
        AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
        AND (p_included_customers = '{}' OR p.customer_id = ANY(p_included_customers))
        AND (
          p_period_type = 'yearly'
          OR (v_year_start IS NOT NULL AND p.effective_date >= v_year_start AND p.effective_date <= v_year_end)
        )
    )
    SELECT
      fp.yr,
      CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END,
      COALESCE(SUM(fp.amt), 0),
      COUNT(*),
      COUNT(DISTINCT fp.cid)
    FROM filtered_payments fp
    GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
    ORDER BY fp.yr DESC, 2 ASC;
  END IF;
END;
$$;

/*
  # Create filtered payment aggregates function

  1. New Functions
    - `get_filtered_payment_aggregates` - Returns payment totals and counts grouped by year and month, 
      with optional filters for status, type, payment_method, and invoice application presence.
      Used by the Payment Analytics page to support filtering in yearly and monthly views.

  2. Parameters
    - `p_period_type` (text) - 'yearly' or 'monthly'
    - `p_year` (int) - Year filter (required for monthly, optional for yearly)
    - `p_status` (text) - Filter by payment status (NULL for all)
    - `p_type` (text) - Filter by payment type (NULL for all)
    - `p_payment_method` (text) - Filter by payment method (NULL for all)
    - `p_has_applications` (text) - 'has_applications', 'no_applications', or NULL for all
    - `p_excluded_customers` (text[]) - Customer IDs to exclude

  3. Security
    - Function is accessible to authenticated users
*/

CREATE OR REPLACE FUNCTION get_filtered_payment_aggregates(
  p_period_type text,
  p_year int DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_has_applications text DEFAULT NULL,
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE (
  agg_year int,
  agg_month int,
  total_amount numeric,
  payment_count bigint,
  unique_customers bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered_payments AS (
    SELECT 
      p.id,
      EXTRACT(YEAR FROM COALESCE(p.doc_date, p.application_date))::int AS yr,
      EXTRACT(MONTH FROM COALESCE(p.doc_date, p.application_date))::int AS mo,
      p.payment_amount::numeric,
      p.customer_id
    FROM acumatica_payments p
    WHERE 
      (p_status IS NULL OR p.status = p_status)
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
        OR (p_period_type = 'monthly' AND EXTRACT(YEAR FROM COALESCE(p.doc_date, p.application_date)) = p_year)
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

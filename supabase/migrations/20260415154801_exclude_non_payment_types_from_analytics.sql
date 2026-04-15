/*
  # Exclude non-payment types from payment analytics

  1. Changes
    - Update `get_filtered_payment_aggregates` to exclude Credit Memo, Balance WO, Cash Sale, Cash Return types
    - These types should not appear in payment analytics totals or counts

  2. Important Notes
    - Only Payment, Prepayment, Refund, Voided Payment, Voided Refund, Debit Memo are included
    - The exclusion applies regardless of other filters
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
RETURNS TABLE(
  agg_year int,
  agg_month int,
  total_amount numeric,
  payment_count bigint,
  unique_customers bigint
)
LANGUAGE sql STABLE
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

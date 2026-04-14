/*
  # Fix get_payment_summary_stats null field names

  1. Changes
    - Fix `jsonb_object_agg` crashing when payment_method, type, or status is NULL
    - Use COALESCE to replace NULL keys with 'Unknown' in aggregation
  
  2. Important Notes
    - Some payments have NULL payment_method which causes "field name must not be null" error
    - This fix ensures the function works even with NULL values in grouping columns
*/

CREATE OR REPLACE FUNCTION get_payment_summary_stats(
  p_start_date date,
  p_end_date date,
  p_excluded_customers text[] DEFAULT ARRAY[]::text[],
  p_type text DEFAULT NULL,
  p_exclude_credit_memos boolean DEFAULT true
)
RETURNS TABLE (
  total_amount numeric,
  payment_count bigint,
  unique_customer_count bigint,
  avg_payment_amount numeric,
  payment_types jsonb,
  payment_methods jsonb,
  status_breakdown jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
RETURN QUERY
WITH filtered_payments AS (
  SELECT
    p.payment_amount,
    p.customer_id,
    p.type,
    p.payment_method,
    p.status
  FROM acumatica_payments p
  WHERE p.application_date >= p_start_date
    AND p.application_date < p_end_date
    AND (p_type IS NOT NULL AND p.type = p_type
         OR p_type IS NULL AND (NOT p_exclude_credit_memos OR p.type != 'Credit Memo'))
    AND (p_excluded_customers = ARRAY[]::text[] OR p.customer_id != ALL(p_excluded_customers))
),
type_stats AS (
  SELECT
    COALESCE(fp.type, 'Unknown') AS type_name,
    COUNT(*) as count,
    SUM(fp.payment_amount) as total
  FROM filtered_payments fp
  GROUP BY COALESCE(fp.type, 'Unknown')
),
method_stats AS (
  SELECT
    COALESCE(fp.payment_method, 'Unknown') AS method_name,
    COUNT(*) as count,
    SUM(fp.payment_amount) as total
  FROM filtered_payments fp
  GROUP BY COALESCE(fp.payment_method, 'Unknown')
),
status_stats AS (
  SELECT
    COALESCE(fp.status, 'Unknown') AS status_name,
    COUNT(*) as count,
    SUM(fp.payment_amount) as total
  FROM filtered_payments fp
  GROUP BY COALESCE(fp.status, 'Unknown')
)
SELECT
  COALESCE(SUM(fp.payment_amount), 0) as total_amount,
  COUNT(*) as payment_count,
  COUNT(DISTINCT fp.customer_id) as unique_customer_count,
  COALESCE(AVG(fp.payment_amount), 0) as avg_payment_amount,
  (SELECT COALESCE(jsonb_object_agg(ts.type_name, jsonb_build_object('count', ts.count, 'total', ts.total)), '{}'::jsonb) FROM type_stats ts) as payment_types,
  (SELECT COALESCE(jsonb_object_agg(ms.method_name, jsonb_build_object('count', ms.count, 'total', ms.total)), '{}'::jsonb) FROM method_stats ms) as payment_methods,
  (SELECT COALESCE(jsonb_object_agg(ss.status_name, jsonb_build_object('count', ss.count, 'total', ss.total)), '{}'::jsonb) FROM status_stats ss) as status_breakdown
FROM filtered_payments fp;
END;
$$;

/*
  # Fix customer column reference in get_filtered_invoice_aggregates

  1. Changes
    - Replace `i.customer_id` with `i.customer` (the actual column name in acumatica_invoices)
*/

CREATE OR REPLACE FUNCTION get_filtered_invoice_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_included_customers text[] DEFAULT '{}',
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE(
  agg_year integer,
  agg_month integer,
  total_amount numeric,
  invoice_count bigint,
  unique_customers bigint,
  total_balance numeric,
  total_open_balance numeric,
  credit_memo_amount numeric,
  credit_memo_count bigint,
  open_invoice_balance numeric,
  open_invoice_count bigint,
  balanced_invoice_balance numeric,
  balanced_invoice_count bigint,
  open_cm_balance numeric,
  open_cm_count bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_year_start date;
  v_year_end date;
BEGIN
  IF p_period_type = 'monthly' AND p_year IS NOT NULL THEN
    v_year_start := make_date(p_year, 1, 1);
    v_year_end := make_date(p_year, 12, 31);
  END IF;

  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT
      i.id,
      EXTRACT(YEAR FROM i.date)::int AS yr,
      EXTRACT(MONTH FROM i.date)::int AS mo,
      i.amount::numeric AS amt,
      COALESCE(i.balance, 0)::numeric AS bal,
      i.customer AS cid,
      i.type,
      i.status
    FROM acumatica_invoices i
    WHERE
      i.status != 'On Hold'
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_type IS NULL OR i.type = p_type)
      AND (p_excluded_customers = '{}' OR i.customer != ALL(p_excluded_customers))
      AND (p_included_customers = '{}' OR i.customer = ANY(p_included_customers))
      AND (
        p_period_type = 'yearly'
        OR (v_year_start IS NOT NULL AND i.date >= v_year_start AND i.date <= v_year_end)
      )
  )
  SELECT
    fp.yr,
    CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END,
    COALESCE(SUM(fp.amt), 0),
    COUNT(*),
    COUNT(DISTINCT fp.cid),
    COALESCE(SUM(fp.bal), 0),
    COALESCE(SUM(CASE WHEN fp.status = 'Open' THEN fp.bal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' THEN fp.amt ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.status = 'Open' AND fp.type != 'Credit Memo' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.status = 'Open' AND fp.type != 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.status = 'Closed' AND fp.bal > 0 THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.status = 'Closed' AND fp.bal > 0 THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.status = 'Open' AND fp.type = 'Credit Memo' THEN ABS(fp.bal) ELSE 0 END), 0),
    COUNT(CASE WHEN fp.status = 'Open' AND fp.type = 'Credit Memo' THEN 1 END)
  FROM filtered_invoices fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
  ORDER BY fp.yr DESC, 2 ASC;
END;
$$;
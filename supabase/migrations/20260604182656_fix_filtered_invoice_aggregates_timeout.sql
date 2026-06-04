/*
  # Fix filtered invoice aggregates timeout

  1. Problem
    - get_filtered_invoice_aggregates has no statement_timeout, so it uses the default 8s
    - When period_type='yearly' it scans all invoices for the org across all years (~100K+ rows)
    - This frequently times out, causing the yearly view to show no data for some years

  2. Changes
    - Recreate get_filtered_invoice_aggregates with SET statement_timeout = '120s'
    - Add a composite index to speed up the yearly aggregation query

  3. Notes
    - This does not change the function logic, only adds timeout configuration
    - The existing index on (organization_id, date, type) helps but the explicit timeout prevents silent failures
*/

-- Add statement timeout to the function
CREATE OR REPLACE FUNCTION get_filtered_invoice_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_included_customers text[] DEFAULT '{}',
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE(
  year integer,
  month integer,
  total_amount numeric,
  invoice_count bigint,
  customer_count bigint,
  total_balance numeric,
  open_balance numeric,
  credit_memo_amount numeric,
  credit_memo_count bigint,
  open_invoice_balance numeric,
  open_invoice_count bigint,
  balanced_invoice_balance numeric,
  balanced_invoice_count bigint,
  open_cm_balance numeric,
  open_cm_count bigint,
  open_dm_balance numeric,
  open_dm_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := get_user_org_id();

  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT
      date_part('year', i.date)::int AS yr,
      date_part('month', i.date)::int AS mo,
      i.amount::numeric AS amt,
      COALESCE(i.balance, 0)::numeric AS bal,
      i.customer AS cid,
      i.type,
      i.status
    FROM acumatica_invoices i
    WHERE
      i.organization_id = v_org_id
      AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_type IS NULL OR i.type = p_type)
      AND (p_excluded_customers = '{}' OR i.customer != ALL(p_excluded_customers))
      AND (p_included_customers = '{}' OR i.customer = ANY(p_included_customers))
      AND (
        p_period_type = 'yearly'
        OR (p_year IS NOT NULL AND i.date >= make_date(p_year, 1, 1) AND i.date <= make_date(p_year, 12, 31))
      )
  )
  SELECT
    fp.yr,
    CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END,
    COALESCE(SUM(fp.amt), 0),
    COUNT(*),
    COUNT(DISTINCT fp.cid),
    COALESCE(SUM(fp.bal), 0),
    COALESCE(SUM(CASE WHEN fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' THEN fp.amt ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status IN ('Open', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status IN ('Open', 'Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status = 'Balanced' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status = 'Balanced' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)
  FROM filtered_invoices fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END
  ORDER BY fp.yr DESC, 2 ASC;
END;
$$;

-- Add covering index for the yearly aggregation path
CREATE INDEX IF NOT EXISTS idx_invoices_org_type_date_yearly_agg
  ON acumatica_invoices (organization_id, type, date)
  INCLUDE (amount, balance, customer, status)
  WHERE type IN ('Invoice', 'Debit Memo', 'Credit Memo');

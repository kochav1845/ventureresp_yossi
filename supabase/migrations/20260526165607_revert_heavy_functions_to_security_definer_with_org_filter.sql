/*
  # Revert heavy analytics functions to SECURITY DEFINER with explicit org filtering

  When functions are SECURITY INVOKER, RLS policies evaluate get_user_org_id() per-row
  on every table access, causing statement timeouts on large tables.

  Fix: Make functions SECURITY DEFINER (bypasses RLS) but add explicit
  WHERE organization_id = get_user_org_id() inside them for the same security effect
  evaluated only once.
*/

-- Fix get_filtered_invoice_aggregates
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
  open_cm_count bigint,
  open_dm_balance numeric,
  open_dm_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
BEGIN
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
      AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
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
    COALESCE(SUM(CASE WHEN fp.status = 'Open' THEN fp.bal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' THEN fp.amt ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Invoice' AND fp.status = 'Open' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Invoice' AND fp.status = 'Open' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Invoice' AND fp.status = 'Balanced' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Invoice' AND fp.status = 'Balanced' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced') THEN 1 END)
  FROM filtered_invoices fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END
  ORDER BY fp.yr DESC, 2 ASC;
END;
$$;

-- Fix get_filtered_payment_aggregates (both overloads)
-- First check what overloads exist

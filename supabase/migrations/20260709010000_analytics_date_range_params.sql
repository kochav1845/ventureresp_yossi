/*
  # Invoice Analytics summary cards respect the date range

  Add p_date_from / p_date_to to the analytics functions so the monthly/yearly
  summary cards (Net Invoiced, Net Open, Credit Memos, Unique Customers) reflect
  the date-range filter in addition to status/type/included/excluded customers.
  (The daily view already filters by date range in-memory.)

  Signatures changed (new params) so both are dropped and recreated.
*/

DROP FUNCTION IF EXISTS get_filtered_invoice_aggregates(text, integer, text, text, text[], text[]);
CREATE OR REPLACE FUNCTION get_filtered_invoice_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_included_customers text[] DEFAULT '{}',
  p_excluded_customers text[] DEFAULT '{}',
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(
  year integer, month integer, total_amount numeric, invoice_count bigint, customer_count bigint,
  total_balance numeric, open_balance numeric, credit_memo_amount numeric, credit_memo_count bigint,
  open_invoice_balance numeric, open_invoice_count bigint, balanced_invoice_balance numeric, balanced_invoice_count bigint,
  open_cm_balance numeric, open_cm_count bigint, open_dm_balance numeric, open_dm_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout = '120s'
AS $fn$
DECLARE v_org_id uuid;
BEGIN
  v_org_id := get_user_org_id();
  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT date_part('year', i.date)::int AS yr, date_part('month', i.date)::int AS mo,
      i.amount::numeric AS amt, COALESCE(i.balance, 0)::numeric AS bal, i.customer AS cid, i.type, i.status
    FROM acumatica_invoices i
    WHERE i.organization_id = v_org_id
      AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
      AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_type IS NULL OR i.type = p_type)
      AND (p_excluded_customers = '{}' OR i.customer <> ALL(p_excluded_customers))
      AND (p_included_customers = '{}' OR i.customer = ANY(p_included_customers))
      AND (p_date_from IS NULL OR i.date >= p_date_from)
      AND (p_date_to IS NULL OR i.date <= p_date_to)
      AND (p_period_type = 'yearly' OR (p_year IS NOT NULL AND i.date >= make_date(p_year, 1, 1) AND i.date <= make_date(p_year, 12, 31)))
  )
  SELECT fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END,
    COALESCE(SUM(fp.amt), 0), COUNT(*), COUNT(DISTINCT fp.cid), COALESCE(SUM(fp.bal), 0),
    COALESCE(SUM(CASE WHEN fp.status IN ('Open','Balanced','Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' THEN fp.amt ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice','Debit Memo') AND fp.status IN ('Open','Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice','Debit Memo') AND fp.status IN ('Open','Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice','Debit Memo') AND fp.status = 'Balanced' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice','Debit Memo') AND fp.status = 'Balanced' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open','Balanced','Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open','Balanced','Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open','Balanced','Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open','Balanced','Credit Hold') THEN 1 END)
  FROM filtered_invoices fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END
  ORDER BY fp.yr DESC, 2 ASC;
END;
$fn$;

DROP FUNCTION IF EXISTS get_analytics_customer_count(int, text, text, text[], text[]);
CREATE OR REPLACE FUNCTION public.get_analytics_customer_count(
  p_year int DEFAULT NULL, p_status text DEFAULT NULL, p_type text DEFAULT NULL,
  p_included_customers text[] DEFAULT '{}', p_excluded_customers text[] DEFAULT '{}',
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  select count(distinct i.customer)
  from acumatica_invoices i
  where i.organization_id = get_user_org_id()
    and i.type in ('Invoice','Debit Memo','Credit Memo')
    and i.status in ('Balanced','Credit Hold','Open','Closed','Voided','Canceled')
    and (p_status is null or i.status = p_status)
    and (p_type is null or i.type = p_type)
    and (coalesce(array_length(p_excluded_customers,1),0) = 0 or i.customer <> all(p_excluded_customers))
    and (coalesce(array_length(p_included_customers,1),0) = 0 or i.customer = any(p_included_customers))
    and (p_date_from is null or i.date >= p_date_from)
    and (p_date_to is null or i.date <= p_date_to)
    and (p_year is null or (i.date >= make_date(p_year,1,1) and i.date <= make_date(p_year,12,31)));
$fn$;

/*
  # Include Balanced invoices in open balance calculations

  1. Problem
    - The invoice month summary only counted status = 'Open' for the open balance columns
    - Acumatica treats both 'Open' and 'Balanced' invoices as outstanding
    - 807 Balanced invoices with $4.15M in balance were being excluded
    - This caused the Invoice Breakdown "Net Outstanding" card to show ~$12.4M
      instead of the correct ~$16.6M

  2. Changes
    - Recreates `invoice_month_summary_mv` materialized view
    - The `*_open_balance` columns now include both 'Open' AND 'Balanced' statuses
    - All other columns remain unchanged
    - Refreshes the materialized view after recreation

  3. Impact
    - Net Outstanding (Open) card will now correctly include Balanced invoices
    - Per-type open balance subtitles will also reflect the combined total
    - Matches Acumatica's AR outstanding balance more accurately
*/

DROP FUNCTION IF EXISTS public.get_invoice_month_summary();
DROP MATERIALIZED VIEW IF EXISTS invoice_month_summary_mv;

CREATE MATERIALIZED VIEW invoice_month_summary_mv AS
SELECT
  to_char(i.date, 'YYYY-MM') as month_key,
  to_char(i.date, 'Mon YYYY') as month_label,
  COUNT(*)::bigint as total_invoices,
  COALESCE(SUM(i.amount), 0)::numeric as total_amount,
  COALESCE(SUM(i.balance), 0)::numeric as total_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.status IN ('Open', 'Balanced')), 0)::numeric as total_open_balance,

  COUNT(*) FILTER (WHERE i.type = 'Invoice')::bigint as invoice_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Invoice' AND i.status IN ('Open', 'Balanced')), 0)::numeric as invoice_open_balance,

  COUNT(*) FILTER (WHERE i.type = 'Credit Memo')::bigint as credit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as credit_memo_open_balance,

  COUNT(*) FILTER (WHERE i.type = 'Debit Memo')::bigint as debit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as debit_memo_open_balance,

  COUNT(*) FILTER (WHERE i.type = 'Credit WO')::bigint as credit_wo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_balance,

  COUNT(*) FILTER (WHERE i.type = 'Overdue Charge')::bigint as overdue_charge_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_balance
FROM acumatica_invoices i
WHERE i.date IS NOT NULL
GROUP BY to_char(i.date, 'YYYY-MM'), to_char(i.date, 'Mon YYYY')
ORDER BY month_key DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_month_summary_mv_key 
  ON invoice_month_summary_mv (month_key);

CREATE OR REPLACE FUNCTION public.get_invoice_month_summary()
RETURNS TABLE(
  month_key text,
  month_label text,
  total_invoices bigint,
  total_amount numeric,
  total_balance numeric,
  total_open_balance numeric,
  invoice_count bigint,
  invoice_amount numeric,
  invoice_balance numeric,
  invoice_open_balance numeric,
  credit_memo_count bigint,
  credit_memo_amount numeric,
  credit_memo_balance numeric,
  credit_memo_open_balance numeric,
  debit_memo_count bigint,
  debit_memo_amount numeric,
  debit_memo_balance numeric,
  debit_memo_open_balance numeric,
  credit_wo_count bigint,
  credit_wo_amount numeric,
  credit_wo_balance numeric,
  overdue_charge_count bigint,
  overdue_charge_amount numeric,
  overdue_charge_balance numeric
)
LANGUAGE sql
STABLE
AS $function$
  SELECT * FROM invoice_month_summary_mv ORDER BY month_key DESC;
$function$;

CREATE OR REPLACE FUNCTION refresh_invoice_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY invoice_month_summary_mv;
END;
$$;

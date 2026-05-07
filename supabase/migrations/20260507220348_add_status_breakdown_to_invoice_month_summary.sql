/*
  # Add per-status breakdown columns to invoice month summary

  1. Problem
    - The summary cards show $127M for "Invoices" but users can't tell
      how much is from Closed vs Open vs Balanced invoices
    - Cards don't communicate what statuses are included in each number
    - Need transparent breakdown so users understand the data

  2. Changes
    - Adds new columns per invoice type for each major status:
      - `*_open_count`, `*_open_amount` (status = 'Open')
      - `*_closed_count`, `*_closed_amount` (status = 'Closed')
      - `*_balanced_count`, `*_balanced_amount` (status = 'Balanced')
    - Recreates the materialized view with the additional columns
    - Updates the `get_invoice_month_summary` function to return new columns

  3. Impact
    - Summary cards can now show status-level detail
    - All existing columns remain unchanged
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

  -- Invoice type: totals
  COUNT(*) FILTER (WHERE i.type = 'Invoice')::bigint as invoice_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Invoice' AND i.status IN ('Open', 'Balanced')), 0)::numeric as invoice_open_balance,
  -- Invoice type: per-status
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open')::bigint as invoice_open_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open'), 0)::numeric as invoice_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed')::bigint as invoice_closed_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed'), 0)::numeric as invoice_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced')::bigint as invoice_balanced_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced'), 0)::numeric as invoice_balanced_amount,

  -- Credit Memo type: totals
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo')::bigint as credit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as credit_memo_open_balance,
  -- Credit Memo: per-status
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open')::bigint as credit_memo_open_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open'), 0)::numeric as credit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed')::bigint as credit_memo_closed_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed'), 0)::numeric as credit_memo_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced')::bigint as credit_memo_balanced_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced'), 0)::numeric as credit_memo_balanced_amount,

  -- Debit Memo type: totals
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo')::bigint as debit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_balance,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as debit_memo_open_balance,
  -- Debit Memo: per-status
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open')::bigint as debit_memo_open_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'), 0)::numeric as debit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed')::bigint as debit_memo_closed_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'), 0)::numeric as debit_memo_closed_amount,

  -- Credit WO
  COUNT(*) FILTER (WHERE i.type = 'Credit WO')::bigint as credit_wo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_balance,

  -- Overdue Charge
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
  invoice_open_count bigint,
  invoice_open_amount numeric,
  invoice_closed_count bigint,
  invoice_closed_amount numeric,
  invoice_balanced_count bigint,
  invoice_balanced_amount numeric,
  credit_memo_count bigint,
  credit_memo_amount numeric,
  credit_memo_balance numeric,
  credit_memo_open_balance numeric,
  credit_memo_open_count bigint,
  credit_memo_open_amount numeric,
  credit_memo_closed_count bigint,
  credit_memo_closed_amount numeric,
  credit_memo_balanced_count bigint,
  credit_memo_balanced_amount numeric,
  debit_memo_count bigint,
  debit_memo_amount numeric,
  debit_memo_balance numeric,
  debit_memo_open_balance numeric,
  debit_memo_open_count bigint,
  debit_memo_open_amount numeric,
  debit_memo_closed_count bigint,
  debit_memo_closed_amount numeric,
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

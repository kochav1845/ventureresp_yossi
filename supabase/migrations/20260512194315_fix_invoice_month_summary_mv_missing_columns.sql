/*
  # Fix invoice_month_summary_mv missing columns

  1. Problem
    - Migration 20260511195746 recreated the materialized view but dropped 4 columns:
      month_label, total_open_balance, credit_wo_balance, overdue_charge_balance
    - The get_invoice_month_summary() function's RETURNS TABLE still declares all 40 columns
    - SELECT * from the view returns 36 columns, causing "return type mismatch" error

  2. Fix
    - Recreate the materialized view with all 40 columns matching the function signature
    - Recreate the function to stay in sync
    - Keeps the On Hold exclusion from the previous migration

  3. Columns restored
    - month_label (text) - human-readable month label e.g. "Jan 2026"
    - total_open_balance (numeric) - sum of balances for Open/Balanced invoices
    - credit_wo_balance (numeric) - sum of balances for Credit WO type
    - overdue_charge_balance (numeric) - sum of balances for Overdue Charge type
*/

DROP MATERIALIZED VIEW IF EXISTS invoice_month_summary_mv;

CREATE MATERIALIZED VIEW invoice_month_summary_mv AS
SELECT
  to_char(i.date, 'YYYY-MM') as month_key,
  to_char(i.date, 'Mon YYYY') as month_label,
  COUNT(*)::bigint as total_invoices,
  COALESCE(SUM(i.amount::numeric), 0)::numeric as total_amount,
  COALESCE(SUM(i.balance::numeric), 0)::numeric as total_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.status IN ('Open', 'Balanced')), 0)::numeric as total_open_balance,

  -- Invoice type: totals
  COUNT(*) FILTER (WHERE i.type = 'Invoice')::bigint as invoice_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status IN ('Open', 'Balanced')), 0)::numeric as invoice_open_balance,
  -- Invoice type: per-status
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open')::bigint as invoice_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open'), 0)::numeric as invoice_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed')::bigint as invoice_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed'), 0)::numeric as invoice_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced')::bigint as invoice_balanced_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced'), 0)::numeric as invoice_balanced_amount,

  -- Credit Memo type: totals
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo')::bigint as credit_memo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as credit_memo_open_balance,
  -- Credit Memo: per-status
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open')::bigint as credit_memo_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open'), 0)::numeric as credit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed')::bigint as credit_memo_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed'), 0)::numeric as credit_memo_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced')::bigint as credit_memo_balanced_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced'), 0)::numeric as credit_memo_balanced_amount,

  -- Debit Memo type: totals
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo')::bigint as debit_memo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0)::numeric as debit_memo_open_balance,
  -- Debit Memo: per-status
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open')::bigint as debit_memo_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'), 0)::numeric as debit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed')::bigint as debit_memo_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'), 0)::numeric as debit_memo_closed_amount,

  -- Credit WO
  COUNT(*) FILTER (WHERE i.type = 'Credit WO')::bigint as credit_wo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_balance,

  -- Overdue Charge
  COUNT(*) FILTER (WHERE i.type = 'Overdue Charge')::bigint as overdue_charge_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_balance
FROM acumatica_invoices i
WHERE i.status != 'On Hold'
GROUP BY to_char(i.date, 'YYYY-MM'), to_char(i.date, 'Mon YYYY')
ORDER BY month_key DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_month_summary_mv_key
  ON invoice_month_summary_mv (month_key);

-- Recreate the function to match the view exactly
DROP FUNCTION IF EXISTS public.get_invoice_month_summary();

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

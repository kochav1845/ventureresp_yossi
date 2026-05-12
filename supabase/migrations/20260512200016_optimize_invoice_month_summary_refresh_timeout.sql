/*
  # Fix invoice_month_summary_mv refresh timeout

  1. Problem
    - REFRESH MATERIALIZED VIEW CONCURRENTLY on 104K+ rows times out at 2 minutes
    - CONCURRENTLY mode is ~2x slower because it diffs old vs new data

  2. Fix
    - Replace materialized view with a regular table for incremental year-by-year updates
    - Refresh processes one year at a time instead of all 104K rows at once
    - Sets statement_timeout to 5min within the function as safety net

  3. Impact
    - Same data, same columns, same get_invoice_month_summary API
    - Refresh completes well within timeout by processing ~10-25K rows per year
*/

-- Create a regular table to replace the materialized view
CREATE TABLE IF NOT EXISTS invoice_month_summary (
  month_key text PRIMARY KEY,
  month_label text NOT NULL,
  total_invoices bigint DEFAULT 0,
  total_amount numeric DEFAULT 0,
  total_balance numeric DEFAULT 0,
  total_open_balance numeric DEFAULT 0,
  invoice_count bigint DEFAULT 0,
  invoice_amount numeric DEFAULT 0,
  invoice_balance numeric DEFAULT 0,
  invoice_open_balance numeric DEFAULT 0,
  invoice_open_count bigint DEFAULT 0,
  invoice_open_amount numeric DEFAULT 0,
  invoice_closed_count bigint DEFAULT 0,
  invoice_closed_amount numeric DEFAULT 0,
  invoice_balanced_count bigint DEFAULT 0,
  invoice_balanced_amount numeric DEFAULT 0,
  credit_memo_count bigint DEFAULT 0,
  credit_memo_amount numeric DEFAULT 0,
  credit_memo_balance numeric DEFAULT 0,
  credit_memo_open_balance numeric DEFAULT 0,
  credit_memo_open_count bigint DEFAULT 0,
  credit_memo_open_amount numeric DEFAULT 0,
  credit_memo_closed_count bigint DEFAULT 0,
  credit_memo_closed_amount numeric DEFAULT 0,
  credit_memo_balanced_count bigint DEFAULT 0,
  credit_memo_balanced_amount numeric DEFAULT 0,
  debit_memo_count bigint DEFAULT 0,
  debit_memo_amount numeric DEFAULT 0,
  debit_memo_balance numeric DEFAULT 0,
  debit_memo_open_balance numeric DEFAULT 0,
  debit_memo_open_count bigint DEFAULT 0,
  debit_memo_open_amount numeric DEFAULT 0,
  debit_memo_closed_count bigint DEFAULT 0,
  debit_memo_closed_amount numeric DEFAULT 0,
  credit_wo_count bigint DEFAULT 0,
  credit_wo_amount numeric DEFAULT 0,
  credit_wo_balance numeric DEFAULT 0,
  overdue_charge_count bigint DEFAULT 0,
  overdue_charge_amount numeric DEFAULT 0,
  overdue_charge_balance numeric DEFAULT 0
);

ALTER TABLE invoice_month_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice month summary"
  ON invoice_month_summary
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed from existing matview
INSERT INTO invoice_month_summary
SELECT * FROM invoice_month_summary_mv
ON CONFLICT (month_key) DO NOTHING;

-- Drop old functions that reference the matview type
DROP FUNCTION IF EXISTS get_invoice_month_summary();

-- Rewrite refresh function to use table with year-by-year batching
CREATE OR REPLACE FUNCTION refresh_invoice_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5min'
AS $$
DECLARE
  v_year integer;
  v_min_year integer;
  v_max_year integer;
BEGIN
  SELECT
    EXTRACT(YEAR FROM MIN(date::date))::integer,
    EXTRACT(YEAR FROM MAX(date::date))::integer
  INTO v_min_year, v_max_year
  FROM acumatica_invoices
  WHERE status != 'On Hold' AND date IS NOT NULL;

  IF v_min_year IS NULL THEN
    RETURN;
  END IF;

  FOR v_year IN v_min_year..v_max_year LOOP
    INSERT INTO invoice_month_summary (
      month_key, month_label,
      total_invoices, total_amount, total_balance, total_open_balance,
      invoice_count, invoice_amount, invoice_balance, invoice_open_balance,
      invoice_open_count, invoice_open_amount,
      invoice_closed_count, invoice_closed_amount,
      invoice_balanced_count, invoice_balanced_amount,
      credit_memo_count, credit_memo_amount, credit_memo_balance, credit_memo_open_balance,
      credit_memo_open_count, credit_memo_open_amount,
      credit_memo_closed_count, credit_memo_closed_amount,
      credit_memo_balanced_count, credit_memo_balanced_amount,
      debit_memo_count, debit_memo_amount, debit_memo_balance, debit_memo_open_balance,
      debit_memo_open_count, debit_memo_open_amount,
      debit_memo_closed_count, debit_memo_closed_amount,
      credit_wo_count, credit_wo_amount, credit_wo_balance,
      overdue_charge_count, overdue_charge_amount, overdue_charge_balance
    )
    SELECT
      to_char(i.date::timestamptz, 'YYYY-MM'),
      to_char(i.date::timestamptz, 'Mon YYYY'),
      count(*),
      COALESCE(sum(i.amount::numeric), 0),
      COALESCE(sum(i.balance::numeric), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status IN ('Open', 'Balanced')), 0),
      count(*) FILTER (WHERE i.type = 'Invoice'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Invoice'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status IN ('Open', 'Balanced')), 0),
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open'), 0),
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed'), 0),
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced'), 0),
      count(*) FILTER (WHERE i.type = 'Credit Memo'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced')), 0),
      count(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open'), 0),
      count(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed'), 0),
      count(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'), 0),
      count(*) FILTER (WHERE i.type = 'Credit WO'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit WO'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Credit WO'), 0),
      count(*) FILTER (WHERE i.type = 'Overdue Charge'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0)
    FROM acumatica_invoices i
    WHERE EXTRACT(YEAR FROM i.date::date) = v_year
      AND i.status != 'On Hold'
      AND i.date IS NOT NULL
    GROUP BY to_char(i.date::timestamptz, 'YYYY-MM'), to_char(i.date::timestamptz, 'Mon YYYY')
    ON CONFLICT (month_key) DO UPDATE SET
      month_label = EXCLUDED.month_label,
      total_invoices = EXCLUDED.total_invoices,
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      invoice_amount = EXCLUDED.invoice_amount,
      invoice_balance = EXCLUDED.invoice_balance,
      invoice_open_balance = EXCLUDED.invoice_open_balance,
      invoice_open_count = EXCLUDED.invoice_open_count,
      invoice_open_amount = EXCLUDED.invoice_open_amount,
      invoice_closed_count = EXCLUDED.invoice_closed_count,
      invoice_closed_amount = EXCLUDED.invoice_closed_amount,
      invoice_balanced_count = EXCLUDED.invoice_balanced_count,
      invoice_balanced_amount = EXCLUDED.invoice_balanced_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_balance = EXCLUDED.credit_memo_balance,
      credit_memo_open_balance = EXCLUDED.credit_memo_open_balance,
      credit_memo_open_count = EXCLUDED.credit_memo_open_count,
      credit_memo_open_amount = EXCLUDED.credit_memo_open_amount,
      credit_memo_closed_count = EXCLUDED.credit_memo_closed_count,
      credit_memo_closed_amount = EXCLUDED.credit_memo_closed_amount,
      credit_memo_balanced_count = EXCLUDED.credit_memo_balanced_count,
      credit_memo_balanced_amount = EXCLUDED.credit_memo_balanced_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_balance = EXCLUDED.debit_memo_balance,
      debit_memo_open_balance = EXCLUDED.debit_memo_open_balance,
      debit_memo_open_count = EXCLUDED.debit_memo_open_count,
      debit_memo_open_amount = EXCLUDED.debit_memo_open_amount,
      debit_memo_closed_count = EXCLUDED.debit_memo_closed_count,
      debit_memo_closed_amount = EXCLUDED.debit_memo_closed_amount,
      credit_wo_count = EXCLUDED.credit_wo_count,
      credit_wo_amount = EXCLUDED.credit_wo_amount,
      credit_wo_balance = EXCLUDED.credit_wo_balance,
      overdue_charge_count = EXCLUDED.overdue_charge_count,
      overdue_charge_amount = EXCLUDED.overdue_charge_amount,
      overdue_charge_balance = EXCLUDED.overdue_charge_balance;
  END LOOP;
END;
$$;

-- Recreate the read function returning the new table type
CREATE FUNCTION get_invoice_month_summary()
RETURNS SETOF invoice_month_summary
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM invoice_month_summary ORDER BY month_key DESC;
$$;
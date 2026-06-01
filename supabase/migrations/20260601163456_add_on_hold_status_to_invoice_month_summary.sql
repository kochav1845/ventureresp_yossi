/*
  # Add On Hold status columns and include On Hold in invoice month summary

  1. Modified Tables
    - `invoice_month_summary`
      - Added on_hold_count, on_hold_amount, on_hold_balance columns

  2. Changes
    - Adds On Hold status columns
    - Updates refresh function to include On Hold invoices in the summary
    - On Hold invoices are now visible in the breakdown (previously excluded)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_month_summary' AND column_name = 'on_hold_count') THEN
    ALTER TABLE invoice_month_summary
      ADD COLUMN on_hold_count integer DEFAULT 0,
      ADD COLUMN on_hold_amount numeric DEFAULT 0,
      ADD COLUMN on_hold_balance numeric DEFAULT 0;
  END IF;
END $$;

-- Recreate the refresh function to include On Hold status
CREATE OR REPLACE FUNCTION refresh_invoice_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
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
  WHERE date IS NOT NULL;

  IF v_min_year IS NULL THEN
    RETURN;
  END IF;

  FOR v_year IN v_min_year..v_max_year LOOP
    INSERT INTO invoice_month_summary (
      month_key, month_label,
      total_invoices, total_amount, total_balance, total_open_balance,
      -- Overall status breakdowns
      open_count, open_amount, open_balance,
      closed_count, closed_amount, closed_balance,
      balanced_count, balanced_amount, balanced_balance,
      canceled_count, canceled_amount, canceled_balance,
      voided_count, voided_amount, voided_balance,
      credit_hold_count, credit_hold_amount, credit_hold_balance,
      scheduled_count, scheduled_amount, scheduled_balance,
      on_hold_count, on_hold_amount, on_hold_balance,
      -- Invoice type
      invoice_count, invoice_amount, invoice_balance, invoice_open_balance,
      invoice_open_count, invoice_open_amount,
      invoice_closed_count, invoice_closed_amount,
      invoice_balanced_count, invoice_balanced_amount,
      invoice_canceled_count, invoice_canceled_amount,
      invoice_voided_count, invoice_voided_amount,
      invoice_credit_hold_count, invoice_credit_hold_amount,
      -- Credit Memo type
      credit_memo_count, credit_memo_amount, credit_memo_balance, credit_memo_open_balance,
      credit_memo_open_count, credit_memo_open_amount,
      credit_memo_closed_count, credit_memo_closed_amount,
      credit_memo_balanced_count, credit_memo_balanced_amount,
      credit_memo_canceled_count, credit_memo_canceled_amount,
      credit_memo_voided_count, credit_memo_voided_amount,
      -- Debit Memo type
      debit_memo_count, debit_memo_amount, debit_memo_balance, debit_memo_open_balance,
      debit_memo_open_count, debit_memo_open_amount,
      debit_memo_closed_count, debit_memo_closed_amount,
      debit_memo_balanced_count, debit_memo_balanced_amount,
      debit_memo_canceled_count, debit_memo_canceled_amount,
      debit_memo_voided_count, debit_memo_voided_amount,
      -- Other types
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
      -- Overall status breakdowns
      count(*) FILTER (WHERE i.status = 'Open'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Open'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Open'), 0),
      count(*) FILTER (WHERE i.status = 'Closed'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Closed'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Closed'), 0),
      count(*) FILTER (WHERE i.status = 'Balanced'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Balanced'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Balanced'), 0),
      count(*) FILTER (WHERE i.status = 'Canceled'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Canceled'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Canceled'), 0),
      count(*) FILTER (WHERE i.status = 'Voided'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Voided'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Voided'), 0),
      count(*) FILTER (WHERE i.status = 'Credit Hold'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Credit Hold'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Credit Hold'), 0),
      count(*) FILTER (WHERE i.status = 'Scheduled'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'Scheduled'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'Scheduled'), 0),
      count(*) FILTER (WHERE i.status = 'On Hold'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.status = 'On Hold'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.status = 'On Hold'), 0),
      -- Invoice type
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
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Canceled'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Canceled'), 0),
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Voided'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Voided'), 0),
      count(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Credit Hold'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Credit Hold'), 0),
      -- Credit Memo type
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
      count(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Canceled'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Canceled'), 0),
      count(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Voided'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Voided'), 0),
      -- Debit Memo type
      count(*) FILTER (WHERE i.type = 'Debit Memo'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Balanced'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Balanced'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Canceled'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Canceled'), 0),
      count(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Voided'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Voided'), 0),
      -- Other types
      count(*) FILTER (WHERE i.type = 'Credit WO'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Credit WO'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Credit WO'), 0),
      count(*) FILTER (WHERE i.type = 'Overdue Charge'),
      COALESCE(sum(i.amount::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0),
      COALESCE(sum(i.balance::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0)
    FROM acumatica_invoices i
    WHERE EXTRACT(YEAR FROM i.date::date) = v_year
      AND i.date IS NOT NULL
    GROUP BY to_char(i.date::timestamptz, 'YYYY-MM'), to_char(i.date::timestamptz, 'Mon YYYY')
    ON CONFLICT (month_key) DO UPDATE SET
      month_label = EXCLUDED.month_label,
      total_invoices = EXCLUDED.total_invoices,
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      open_count = EXCLUDED.open_count,
      open_amount = EXCLUDED.open_amount,
      open_balance = EXCLUDED.open_balance,
      closed_count = EXCLUDED.closed_count,
      closed_amount = EXCLUDED.closed_amount,
      closed_balance = EXCLUDED.closed_balance,
      balanced_count = EXCLUDED.balanced_count,
      balanced_amount = EXCLUDED.balanced_amount,
      balanced_balance = EXCLUDED.balanced_balance,
      canceled_count = EXCLUDED.canceled_count,
      canceled_amount = EXCLUDED.canceled_amount,
      canceled_balance = EXCLUDED.canceled_balance,
      voided_count = EXCLUDED.voided_count,
      voided_amount = EXCLUDED.voided_amount,
      voided_balance = EXCLUDED.voided_balance,
      credit_hold_count = EXCLUDED.credit_hold_count,
      credit_hold_amount = EXCLUDED.credit_hold_amount,
      credit_hold_balance = EXCLUDED.credit_hold_balance,
      scheduled_count = EXCLUDED.scheduled_count,
      scheduled_amount = EXCLUDED.scheduled_amount,
      scheduled_balance = EXCLUDED.scheduled_balance,
      on_hold_count = EXCLUDED.on_hold_count,
      on_hold_amount = EXCLUDED.on_hold_amount,
      on_hold_balance = EXCLUDED.on_hold_balance,
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
      invoice_canceled_count = EXCLUDED.invoice_canceled_count,
      invoice_canceled_amount = EXCLUDED.invoice_canceled_amount,
      invoice_voided_count = EXCLUDED.invoice_voided_count,
      invoice_voided_amount = EXCLUDED.invoice_voided_amount,
      invoice_credit_hold_count = EXCLUDED.invoice_credit_hold_count,
      invoice_credit_hold_amount = EXCLUDED.invoice_credit_hold_amount,
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
      credit_memo_canceled_count = EXCLUDED.credit_memo_canceled_count,
      credit_memo_canceled_amount = EXCLUDED.credit_memo_canceled_amount,
      credit_memo_voided_count = EXCLUDED.credit_memo_voided_count,
      credit_memo_voided_amount = EXCLUDED.credit_memo_voided_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_balance = EXCLUDED.debit_memo_balance,
      debit_memo_open_balance = EXCLUDED.debit_memo_open_balance,
      debit_memo_open_count = EXCLUDED.debit_memo_open_count,
      debit_memo_open_amount = EXCLUDED.debit_memo_open_amount,
      debit_memo_closed_count = EXCLUDED.debit_memo_closed_count,
      debit_memo_closed_amount = EXCLUDED.debit_memo_closed_amount,
      debit_memo_balanced_count = EXCLUDED.debit_memo_balanced_count,
      debit_memo_balanced_amount = EXCLUDED.debit_memo_balanced_amount,
      debit_memo_canceled_count = EXCLUDED.debit_memo_canceled_count,
      debit_memo_canceled_amount = EXCLUDED.debit_memo_canceled_amount,
      debit_memo_voided_count = EXCLUDED.debit_memo_voided_count,
      debit_memo_voided_amount = EXCLUDED.debit_memo_voided_amount,
      credit_wo_count = EXCLUDED.credit_wo_count,
      credit_wo_amount = EXCLUDED.credit_wo_amount,
      credit_wo_balance = EXCLUDED.credit_wo_balance,
      overdue_charge_count = EXCLUDED.overdue_charge_count,
      overdue_charge_amount = EXCLUDED.overdue_charge_amount,
      overdue_charge_balance = EXCLUDED.overdue_charge_balance;
  END LOOP;
END;
$func$;
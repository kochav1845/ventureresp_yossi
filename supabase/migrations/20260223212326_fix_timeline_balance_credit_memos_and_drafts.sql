/*
  # Fix Timeline Balance Calculation for Credit Memos and Draft Invoices

  1. Problem
    - The timeline balance goes negative because credit memos were being added
      as positive amounts instead of subtracted
    - Draft invoices (status: Balanced, On Hold) were included in the calculation
      even though they are not yet released

  2. Changes
    - `get_single_customer_timeline` function updated:
      - Credit memos and credit write-offs are now subtracted from invoice totals
      - Draft invoices (status: Balanced, On Hold) are excluded
      - Initial balance calculation also excludes drafts and handles credit memos

  3. Impact
    - The "Current Balance" summary card below the timeline will now show
      accurate values consistent with the top-level balance card
*/

DROP FUNCTION IF EXISTS get_single_customer_timeline(TEXT, DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION get_single_customer_timeline(
  p_customer_id TEXT,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_grouping TEXT DEFAULT 'day'
)
RETURNS TABLE (
  date TEXT,
  balance NUMERIC,
  invoices NUMERIC,
  payments NUMERIC,
  overdue_90_days NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from DATE;
  v_date_to DATE;
BEGIN
  v_date_from := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '6 months');
  v_date_to := COALESCE(p_date_to, CURRENT_DATE);

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      v_date_from,
      v_date_to,
      CASE
        WHEN p_grouping = 'week' THEN INTERVAL '1 week'
        WHEN p_grouping = 'month' THEN INTERVAL '1 month'
        ELSE INTERVAL '1 day'
      END
    )::DATE as period_date
  ),
  invoices_by_period AS (
    SELECT
      CASE
        WHEN p_grouping = 'week' THEN date_trunc('week', inv.date)::DATE
        WHEN p_grouping = 'month' THEN date_trunc('month', inv.date)::DATE
        ELSE inv.date
      END as period_date,
      SUM(
        CASE
          WHEN inv.type IN ('Credit Memo', 'Credit WO') THEN -COALESCE(inv.amount, 0)
          ELSE COALESCE(inv.amount, 0)
        END
      ) as invoice_amount
    FROM acumatica_invoices inv
    WHERE inv.customer = p_customer_id
      AND inv.date >= v_date_from
      AND inv.date <= v_date_to
      AND inv.status NOT IN ('Balanced', 'On Hold')
    GROUP BY 1
  ),
  payments_by_period AS (
    SELECT
      CASE
        WHEN p_grouping = 'week' THEN date_trunc('week', pmt.application_date)::DATE
        WHEN p_grouping = 'month' THEN date_trunc('month', pmt.application_date)::DATE
        ELSE pmt.application_date
      END as period_date,
      SUM(COALESCE(pmt.payment_amount, 0)) as payment_amount
    FROM acumatica_payments pmt
    WHERE pmt.customer_id = p_customer_id
      AND pmt.application_date >= v_date_from
      AND pmt.application_date <= v_date_to
      AND pmt.application_date IS NOT NULL
    GROUP BY 1
  ),
  overdue_by_period AS (
    SELECT
      ds.period_date,
      SUM(
        CASE
          WHEN inv.due_date IS NOT NULL
          AND ds.period_date > (inv.due_date + INTERVAL '90 days')::DATE
          AND inv.balance > 0
          AND inv.status = 'Open'
          THEN inv.balance
          ELSE 0
        END
      ) as overdue_amount
    FROM date_series ds
    CROSS JOIN acumatica_invoices inv
    WHERE inv.customer = p_customer_id
      AND inv.date <= ds.period_date
    GROUP BY ds.period_date
  ),
  initial_balance AS (
    SELECT
      COALESCE(
        (SELECT SUM(
          CASE
            WHEN inv.type IN ('Credit Memo', 'Credit WO') THEN -inv.balance
            ELSE inv.balance
          END
        )
         FROM acumatica_invoices inv
         WHERE inv.customer = p_customer_id
         AND inv.date < v_date_from
         AND inv.status NOT IN ('Balanced', 'On Hold')), 0
      ) as starting_balance
  ),
  combined_data AS (
    SELECT
      ds.period_date,
      COALESCE(i.invoice_amount, 0) as invoice_amount,
      COALESCE(p.payment_amount, 0) as payment_amount,
      COALESCE(o.overdue_amount, 0) as overdue_amount
    FROM date_series ds
    LEFT JOIN invoices_by_period i ON ds.period_date = i.period_date
    LEFT JOIN payments_by_period p ON ds.period_date = p.period_date
    LEFT JOIN overdue_by_period o ON ds.period_date = o.period_date
  )
  SELECT
    cd.period_date::TEXT as date,
    (
      (SELECT ib.starting_balance FROM initial_balance ib) +
      SUM(cd.invoice_amount - cd.payment_amount)
        OVER (ORDER BY cd.period_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )::NUMERIC as balance,
    cd.invoice_amount::NUMERIC as invoices,
    cd.payment_amount::NUMERIC as payments,
    cd.overdue_amount::NUMERIC as overdue_90_days
  FROM combined_data cd
  ORDER BY cd.period_date ASC;
END;
$$;

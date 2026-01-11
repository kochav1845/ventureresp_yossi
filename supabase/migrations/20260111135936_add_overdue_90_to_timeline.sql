/*
  # Add 90+ Days Overdue to Customer Timeline

  1. Changes
    - Drop and recreate get_single_customer_timeline function
    - Add overdue_90_days field to return type
    - Calculates invoices that are 90+ days past their due date
*/

DROP FUNCTION IF EXISTS get_single_customer_timeline(TEXT, DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION get_single_customer_timeline(
  p_customer_id TEXT,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_grouping TEXT DEFAULT 'day' -- 'day', 'week', or 'month'
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
  -- Set default date range if not provided (last 6 months)
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
      SUM(COALESCE(inv.amount, 0)) as invoice_amount
    FROM acumatica_invoices inv
    WHERE inv.customer = p_customer_id
      AND inv.date >= v_date_from
      AND inv.date <= v_date_to
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
  -- Calculate 90+ days overdue amount for each period
  overdue_by_period AS (
    SELECT
      ds.period_date,
      SUM(
        CASE
          WHEN inv.due_date IS NOT NULL
          AND ds.period_date > (inv.due_date + INTERVAL '90 days')::DATE
          AND inv.balance > 0
          THEN inv.balance
          ELSE 0
        END
      ) as overdue_amount
    FROM date_series ds
    CROSS JOIN acumatica_invoices inv
    WHERE inv.customer = p_customer_id
      AND inv.date <= ds.period_date  -- Invoice must exist at this point in time
    GROUP BY ds.period_date
  ),
  -- Get initial balance at start date
  initial_balance AS (
    SELECT
      COALESCE(
        (SELECT SUM(inv.balance)
         FROM acumatica_invoices inv
         WHERE inv.customer = p_customer_id
         AND inv.date < v_date_from), 0
      ) as starting_balance
  ),
  -- Combine all data
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

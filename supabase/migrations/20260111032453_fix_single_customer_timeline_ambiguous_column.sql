/*
  # Fix Single Customer Timeline Function

  1. Changes
    - Fix ambiguous "balance" column reference
    - Fully qualify all column names
*/

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
  payments NUMERIC
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
      COALESCE(p.payment_amount, 0) as payment_amount
    FROM date_series ds
    LEFT JOIN invoices_by_period i ON ds.period_date = i.period_date
    LEFT JOIN payments_by_period p ON ds.period_date = p.period_date
  )
  SELECT
    cd.period_date::TEXT as date,
    (
      (SELECT ib.starting_balance FROM initial_balance ib) +
      SUM(cd.invoice_amount - cd.payment_amount)
        OVER (ORDER BY cd.period_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )::NUMERIC as balance,
    cd.invoice_amount::NUMERIC as invoices,
    cd.payment_amount::NUMERIC as payments
  FROM combined_data cd
  ORDER BY cd.period_date ASC;
END;
$$;
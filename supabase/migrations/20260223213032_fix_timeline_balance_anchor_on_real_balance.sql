/*
  # Fix Timeline Balance: Anchor on Real Current Balance

  1. Problem
    - The timeline reconstructed balance from invoice amounts and payments
    - The initial_balance used CURRENT balance values for old invoices
    - Old invoices that were paid have balance=0 now, but their payments
      appear in the visible window, creating a massive mismatch
    - Example: An invoice from 2024 (before window) with current balance $0
      had its payment in 2025 (inside window), making balance go negative

  2. Solution
    - Calculate the TRUE current balance from actual invoice balances
    - Derive initial_balance backwards:
      initial = true_balance - in_period_invoices + in_period_payments
    - This guarantees the timeline ENDS at the correct current balance
    - Historical trajectory remains directionally correct

  3. Additional Fixes
    - Exclude credit memo type payments from payment totals (already handled
      on invoice side by negating credit memo amounts)
    - Exclude draft invoices (Balanced, On Hold) from all calculations
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
  v_real_current_balance NUMERIC;
  v_period_invoices_total NUMERIC;
  v_period_payments_total NUMERIC;
  v_initial_balance NUMERIC;
BEGIN
  v_date_from := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '6 months');
  v_date_to := COALESCE(p_date_to, CURRENT_DATE);

  SELECT COALESCE(SUM(
    CASE
      WHEN inv.type IN ('Credit Memo', 'Credit WO') THEN -inv.balance
      ELSE inv.balance
    END
  ), 0)
  INTO v_real_current_balance
  FROM acumatica_invoices inv
  WHERE inv.customer = p_customer_id
    AND inv.status = 'Open'
    AND inv.balance > 0;

  SELECT COALESCE(SUM(
    CASE
      WHEN inv.type IN ('Credit Memo', 'Credit WO') THEN -inv.amount
      ELSE inv.amount
    END
  ), 0)
  INTO v_period_invoices_total
  FROM acumatica_invoices inv
  WHERE inv.customer = p_customer_id
    AND inv.date >= v_date_from
    AND inv.date <= v_date_to
    AND inv.status NOT IN ('Balanced', 'On Hold');

  SELECT COALESCE(SUM(pmt.payment_amount), 0)
  INTO v_period_payments_total
  FROM acumatica_payments pmt
  WHERE pmt.customer_id = p_customer_id
    AND pmt.application_date >= v_date_from
    AND pmt.application_date <= v_date_to
    AND pmt.application_date IS NOT NULL
    AND pmt.type NOT IN ('Credit Memo');

  v_initial_balance := v_real_current_balance - v_period_invoices_total + v_period_payments_total;

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
      AND pmt.type NOT IN ('Credit Memo')
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
      v_initial_balance +
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

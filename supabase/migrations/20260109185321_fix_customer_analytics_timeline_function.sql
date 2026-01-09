/*
  # Fix Customer Analytics Timeline Function

  1. Changes
    - Fix column reference from `doc_balance` to `balance`
    - Use correct column names from acumatica_invoices table
*/

CREATE OR REPLACE FUNCTION get_customer_analytics_timeline(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_grouping TEXT DEFAULT 'day' -- 'day', 'week', or 'month'
)
RETURNS TABLE (
  period_date DATE,
  invoices_opened BIGINT,
  invoice_amount NUMERIC,
  payments_made BIGINT,
  payment_amount NUMERIC,
  balance_owed NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from DATE;
  v_date_to DATE;
BEGIN
  -- Set default date range if not provided (last 30 days)
  v_date_from := COALESCE(p_date_from::DATE, CURRENT_DATE - INTERVAL '30 days');
  v_date_to := COALESCE(p_date_to::DATE, CURRENT_DATE);

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
        WHEN p_grouping = 'week' THEN date_trunc('week', i.date)::DATE
        WHEN p_grouping = 'month' THEN date_trunc('month', i.date)::DATE
        ELSE i.date
      END as period_date,
      COUNT(*) as invoice_count,
      SUM(i.balance) as invoice_total
    FROM acumatica_invoices i
    WHERE i.date >= v_date_from AND i.date <= v_date_to
    GROUP BY 1
  ),
  payments_by_period AS (
    SELECT
      CASE 
        WHEN p_grouping = 'week' THEN date_trunc('week', p.application_date)::DATE
        WHEN p_grouping = 'month' THEN date_trunc('month', p.application_date)::DATE
        ELSE p.application_date
      END as period_date,
      COUNT(*) as payment_count,
      SUM(p.payment_amount) as payment_total
    FROM acumatica_payments p
    WHERE p.application_date >= v_date_from AND p.application_date <= v_date_to
    GROUP BY 1
  ),
  balance_by_period AS (
    SELECT
      ds.period_date,
      COALESCE(SUM(
        CASE 
          WHEN i.date <= ds.period_date 
          THEN i.balance 
          ELSE 0 
        END
      ), 0) as running_balance
    FROM date_series ds
    CROSS JOIN acumatica_invoices i
    GROUP BY ds.period_date
  )
  SELECT
    ds.period_date,
    COALESCE(i.invoice_count, 0)::BIGINT as invoices_opened,
    COALESCE(i.invoice_total, 0)::NUMERIC as invoice_amount,
    COALESCE(p.payment_count, 0)::BIGINT as payments_made,
    COALESCE(p.payment_total, 0)::NUMERIC as payment_amount,
    COALESCE(b.running_balance, 0)::NUMERIC as balance_owed
  FROM date_series ds
  LEFT JOIN invoices_by_period i ON ds.period_date = i.period_date
  LEFT JOIN payments_by_period p ON ds.period_date = p.period_date
  LEFT JOIN balance_by_period b ON ds.period_date = b.period_date
  ORDER BY ds.period_date ASC;
END;
$$;

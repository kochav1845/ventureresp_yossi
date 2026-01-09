/*
  # Create Customer-Level Analytics Function

  1. New Functions
    - `get_customer_level_analytics` - Returns analytics data for individual customers
      - Customer info
      - Total invoice amount
      - Total payment amount
      - Current balance
      - Invoice count
      - Payment count
      - Last invoice date
      - Last payment date
      - Average days to pay
      
  2. Features
    - Supports filtering by date range
    - Includes calculated metrics per customer
    - Sorted by balance owed (highest first)
*/

CREATE OR REPLACE FUNCTION get_customer_level_analytics(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  customer_id TEXT,
  customer_name TEXT,
  total_invoice_amount NUMERIC,
  total_payment_amount NUMERIC,
  current_balance NUMERIC,
  invoice_count BIGINT,
  payment_count BIGINT,
  last_invoice_date DATE,
  last_payment_date DATE,
  avg_days_to_pay NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from DATE;
  v_date_to DATE;
BEGIN
  -- Set default date range if not provided (all time)
  v_date_from := COALESCE(p_date_from::DATE, '2000-01-01'::DATE);
  v_date_to := COALESCE(p_date_to::DATE, CURRENT_DATE);

  RETURN QUERY
  WITH customer_invoices AS (
    SELECT
      i.customer_id,
      i.customer_name,
      COUNT(*) as inv_count,
      SUM(COALESCE(i.balance, 0)) as total_inv_amt,
      MAX(i.date) as last_inv_date
    FROM acumatica_invoices i
    WHERE i.date >= v_date_from AND i.date <= v_date_to
    GROUP BY i.customer_id, i.customer_name
  ),
  customer_payments AS (
    SELECT
      p.customer_id,
      p.customer_name,
      COUNT(*) as pay_count,
      SUM(COALESCE(p.payment_amount, 0)) as total_pay_amt,
      MAX(p.application_date) as last_pay_date,
      AVG(
        CASE 
          WHEN p.application_date IS NOT NULL AND p.created_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (p.application_date - p.created_at::DATE)) / 86400
          ELSE NULL
        END
      ) as avg_days
    FROM acumatica_payments p
    WHERE p.application_date >= v_date_from 
      AND p.application_date <= v_date_to
      AND p.application_date IS NOT NULL
    GROUP BY p.customer_id, p.customer_name
  ),
  customer_balances AS (
    SELECT
      i.customer_id,
      SUM(COALESCE(i.balance, 0)) as current_bal
    FROM acumatica_invoices i
    WHERE i.status != 'Closed'
    GROUP BY i.customer_id
  )
  SELECT
    COALESCE(ci.customer_id, cp.customer_id)::TEXT as customer_id,
    COALESCE(ci.customer_name, cp.customer_name)::TEXT as customer_name,
    COALESCE(ci.total_inv_amt, 0)::NUMERIC as total_invoice_amount,
    COALESCE(cp.total_pay_amt, 0)::NUMERIC as total_payment_amount,
    COALESCE(cb.current_bal, 0)::NUMERIC as current_balance,
    COALESCE(ci.inv_count, 0)::BIGINT as invoice_count,
    COALESCE(cp.pay_count, 0)::BIGINT as payment_count,
    ci.last_inv_date as last_invoice_date,
    cp.last_pay_date as last_payment_date,
    COALESCE(cp.avg_days, 0)::NUMERIC as avg_days_to_pay
  FROM customer_invoices ci
  FULL OUTER JOIN customer_payments cp 
    ON ci.customer_id = cp.customer_id
  LEFT JOIN customer_balances cb 
    ON COALESCE(ci.customer_id, cp.customer_id) = cb.customer_id
  WHERE COALESCE(ci.total_inv_amt, 0) > 0 OR COALESCE(cp.total_pay_amt, 0) > 0
  ORDER BY current_balance DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

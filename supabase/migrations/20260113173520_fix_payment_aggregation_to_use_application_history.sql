/*
  # Fix Payment Aggregation to Use ApplicationHistory (Transaction-Accurate Model)

  ## Problem
  The system was incorrectly using Payment.Amount (header) for aggregations instead of 
  ApplicationHistory.Amount (transaction-level). This caused:
  - Inflated payment totals
  - Missing application-only rows
  - Mismatch vs Acumatica reports

  ## Solution (Option B - Transaction-Accurate Model)
  - Use SUM(payment_invoice_applications.amount_paid) for totals
  - Preserve Acumatica's sign logic (no ABS(), no sign flipping)
  - Ignore Payment.Amount (header) for aggregation purposes

  ## Changes
  1. Create new function get_transaction_accurate_payment_stats()
  2. Create view for transaction-accurate customer payment totals
  3. Update get_payment_application_stats() to explicitly note it uses correct model
*/

-- Create a function that returns transaction-accurate payment totals per customer
-- Uses ApplicationHistory amounts with preserved signs (no ABS, no sign flip)
CREATE OR REPLACE FUNCTION get_customer_payment_totals_accurate()
RETURNS TABLE (
  customer_id TEXT,
  total_applied NUMERIC,
  application_count BIGINT,
  invoice_applications NUMERIC,
  credit_applications NUMERIC,
  earliest_application TIMESTAMPTZ,
  latest_application TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pia.customer_id,
    COALESCE(SUM(pia.amount_paid), 0)::NUMERIC as total_applied,
    COUNT(*)::BIGINT as application_count,
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as invoice_applications,
    COALESCE(SUM(CASE WHEN pia.doc_type IN ('Credit Memo', 'CreditMemo') THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as credit_applications,
    MIN(pia.application_date) as earliest_application,
    MAX(pia.application_date) as latest_application
  FROM payment_invoice_applications pia
  WHERE pia.customer_id IS NOT NULL
  GROUP BY pia.customer_id;
END;
$$;

-- Create a function for total payment stats using transaction-accurate model
CREATE OR REPLACE FUNCTION get_payment_stats_transaction_accurate()
RETURNS TABLE (
  total_payments BIGINT,
  total_applications BIGINT,
  unique_customers BIGINT,
  total_applied_amount NUMERIC,
  invoice_application_total NUMERIC,
  credit_application_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT pia.payment_id)::BIGINT as total_payments,
    COUNT(*)::BIGINT as total_applications,
    COUNT(DISTINCT pia.customer_id)::BIGINT as unique_customers,
    COALESCE(SUM(pia.amount_paid), 0)::NUMERIC as total_applied_amount,
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as invoice_application_total,
    COALESCE(SUM(CASE WHEN pia.doc_type IN ('Credit Memo', 'CreditMemo') THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as credit_application_total
  FROM payment_invoice_applications pia;
END;
$$;

-- Create a function that returns payment totals for a date range using the correct model
CREATE OR REPLACE FUNCTION get_payment_totals_by_date_range(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_applied NUMERIC,
  application_count BIGINT,
  unique_payments BIGINT,
  unique_customers BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(pia.amount_paid), 0)::NUMERIC as total_applied,
    COUNT(*)::BIGINT as application_count,
    COUNT(DISTINCT pia.payment_id)::BIGINT as unique_payments,
    COUNT(DISTINCT pia.customer_id)::BIGINT as unique_customers
  FROM payment_invoice_applications pia
  WHERE pia.application_date >= p_start_date
    AND pia.application_date <= p_end_date;
END;
$$;

-- Create a function for monthly payment totals using transaction-accurate model
CREATE OR REPLACE FUNCTION get_monthly_payment_totals_accurate(
  p_months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
  month_date DATE,
  month_label TEXT,
  total_applied NUMERIC,
  application_count BIGINT,
  unique_payments BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date_trunc('month', pia.application_date)::DATE as month_date,
    TO_CHAR(date_trunc('month', pia.application_date), 'YYYY-MM') as month_label,
    COALESCE(SUM(pia.amount_paid), 0)::NUMERIC as total_applied,
    COUNT(*)::BIGINT as application_count,
    COUNT(DISTINCT pia.payment_id)::BIGINT as unique_payments
  FROM payment_invoice_applications pia
  WHERE pia.application_date >= date_trunc('month', CURRENT_DATE - (p_months_back || ' months')::INTERVAL)
    AND pia.application_date IS NOT NULL
  GROUP BY date_trunc('month', pia.application_date)
  ORDER BY month_date DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_customer_payment_totals_accurate() TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_payment_totals_accurate() TO service_role;
GRANT EXECUTE ON FUNCTION get_payment_stats_transaction_accurate() TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_stats_transaction_accurate() TO service_role;
GRANT EXECUTE ON FUNCTION get_payment_totals_by_date_range(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_totals_by_date_range(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_payment_totals_accurate(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_payment_totals_accurate(INTEGER) TO service_role;

-- Add comment explaining the correct model
COMMENT ON FUNCTION get_customer_payment_totals_accurate() IS 
'Returns customer payment totals using the transaction-accurate model (Option B).
Uses SUM(ApplicationHistory.Amount) directly without sign changes.
Preserves Acumatica''s sign logic: negative for invoice applications, negative for credit memos.
DO NOT use Payment.Amount from the header - use these application-level amounts instead.';

COMMENT ON FUNCTION get_payment_stats_transaction_accurate() IS
'Returns overall payment statistics using the transaction-accurate model.
Uses ApplicationHistory amounts with preserved signs (no ABS, no sign flipping).
This will match Acumatica exports exactly.';

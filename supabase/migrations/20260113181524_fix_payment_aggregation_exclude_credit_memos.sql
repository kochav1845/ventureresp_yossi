/*
  # Fix Payment Aggregation - Exclude Credit Memo Double-Counting

  ## Problem
  When a Credit Memo pays an Invoice, Acumatica's ApplicationHistory returns TWO rows:
  - One with doc_type = 'Invoice' (AmountPaid = X)
  - One with doc_type = 'Credit Memo' (AmountPaid = X)
  
  Both amounts are POSITIVE. Summing ALL rows causes exact 2x inflation.

  ## Solution
  All payment aggregation functions must ONLY sum rows where doc_type = 'Invoice'
  to get accurate "total money applied to invoices".

  ## Functions Updated
  1. get_payment_application_stats() - main stats function
  2. get_customer_payment_totals_accurate() - customer-level totals
  3. get_payment_stats_transaction_accurate() - overall stats
  4. get_payment_totals_by_date_range() - date-filtered totals
  5. get_monthly_payment_totals_accurate() - monthly breakdown

  ## Rules Applied
  - Only sum doc_type = 'Invoice' for total_applied
  - Credit Memo applications are tracked separately for reporting
  - No sign flipping, no ABS()
  - Header Payment.Amount is never added to application totals
*/

-- Drop existing functions to allow signature changes
DROP FUNCTION IF EXISTS get_payment_application_stats();
DROP FUNCTION IF EXISTS get_payment_totals_by_date_range(DATE, DATE);
DROP FUNCTION IF EXISTS get_monthly_payment_totals_accurate(INTEGER);

-- 1. Recreate get_payment_application_stats() with extended return columns
CREATE OR REPLACE FUNCTION get_payment_application_stats()
RETURNS TABLE (
  total_payments bigint,
  total_applications bigint,
  unique_customers bigint,
  total_applied numeric,
  invoice_applications_total numeric,
  credit_memo_applications_total numeric
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(DISTINCT payment_id)::bigint as total_payments,
    COUNT(*)::bigint as total_applications,
    COUNT(DISTINCT customer_id)::bigint as unique_customers,
    -- CRITICAL FIX: Only sum Invoice doc_type to avoid double-counting
    COALESCE(SUM(CASE WHEN doc_type = 'Invoice' THEN amount_paid ELSE 0 END), 0)::numeric as total_applied,
    -- Separate tracking for transparency
    COALESCE(SUM(CASE WHEN doc_type = 'Invoice' THEN amount_paid ELSE 0 END), 0)::numeric as invoice_applications_total,
    COALESCE(SUM(CASE WHEN doc_type IN ('Credit Memo', 'CreditMemo') THEN amount_paid ELSE 0 END), 0)::numeric as credit_memo_applications_total
  FROM payment_invoice_applications;
$$;

-- 2. Fix get_customer_payment_totals_accurate()
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
    -- CRITICAL FIX: Only sum Invoice doc_type
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as total_applied,
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

-- 3. Fix get_payment_stats_transaction_accurate()
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
    -- CRITICAL FIX: Only sum Invoice doc_type
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as total_applied_amount,
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as invoice_application_total,
    COALESCE(SUM(CASE WHEN pia.doc_type IN ('Credit Memo', 'CreditMemo') THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as credit_application_total
  FROM payment_invoice_applications pia;
END;
$$;

-- 4. Recreate get_payment_totals_by_date_range() with extended columns
CREATE OR REPLACE FUNCTION get_payment_totals_by_date_range(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_applied NUMERIC,
  application_count BIGINT,
  unique_payments BIGINT,
  unique_customers BIGINT,
  invoice_applied NUMERIC,
  credit_memo_applied NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- CRITICAL FIX: Only sum Invoice doc_type
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as total_applied,
    COUNT(*)::BIGINT as application_count,
    COUNT(DISTINCT pia.payment_id)::BIGINT as unique_payments,
    COUNT(DISTINCT pia.customer_id)::BIGINT as unique_customers,
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as invoice_applied,
    COALESCE(SUM(CASE WHEN pia.doc_type IN ('Credit Memo', 'CreditMemo') THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as credit_memo_applied
  FROM payment_invoice_applications pia
  WHERE pia.application_date >= p_start_date
    AND pia.application_date <= p_end_date;
END;
$$;

-- 5. Recreate get_monthly_payment_totals_accurate() with extended columns
CREATE OR REPLACE FUNCTION get_monthly_payment_totals_accurate(
  p_months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
  month_date DATE,
  month_label TEXT,
  total_applied NUMERIC,
  application_count BIGINT,
  unique_payments BIGINT,
  invoice_applied NUMERIC,
  credit_memo_applied NUMERIC
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
    -- CRITICAL FIX: Only sum Invoice doc_type
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as total_applied,
    COUNT(*)::BIGINT as application_count,
    COUNT(DISTINCT pia.payment_id)::BIGINT as unique_payments,
    COALESCE(SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as invoice_applied,
    COALESCE(SUM(CASE WHEN pia.doc_type IN ('Credit Memo', 'CreditMemo') THEN pia.amount_paid ELSE 0 END), 0)::NUMERIC as credit_memo_applied
  FROM payment_invoice_applications pia
  WHERE pia.application_date >= date_trunc('month', CURRENT_DATE - (p_months_back || ' months')::INTERVAL)
    AND pia.application_date IS NOT NULL
  GROUP BY date_trunc('month', pia.application_date)
  ORDER BY month_date DESC;
END;
$$;

-- 6. Create a helper function for frontend to get correct totals
CREATE OR REPLACE FUNCTION get_invoice_only_payment_total(
  p_payment_ids UUID[] DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF p_payment_ids IS NULL THEN
    RETURN (
      SELECT COALESCE(SUM(amount_paid), 0)
      FROM payment_invoice_applications
      WHERE doc_type = 'Invoice'
    );
  ELSE
    RETURN (
      SELECT COALESCE(SUM(amount_paid), 0)
      FROM payment_invoice_applications
      WHERE doc_type = 'Invoice'
        AND payment_id = ANY(p_payment_ids)
    );
  END IF;
END;
$$;

-- 7. Create function for customer-specific invoice-only totals
CREATE OR REPLACE FUNCTION get_customer_invoice_payments_total(
  p_customer_id TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(amount_paid), 0)
    FROM payment_invoice_applications
    WHERE doc_type = 'Invoice'
      AND customer_id = p_customer_id
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_payment_application_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_application_stats() TO service_role;
GRANT EXECUTE ON FUNCTION get_payment_totals_by_date_range(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_totals_by_date_range(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_payment_totals_accurate(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_payment_totals_accurate(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_invoice_only_payment_total(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invoice_only_payment_total(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION get_customer_invoice_payments_total(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_invoice_payments_total(TEXT) TO service_role;

-- Add documentation comments
COMMENT ON FUNCTION get_payment_application_stats() IS 
'Returns payment application statistics with CORRECT totals.
CRITICAL: total_applied only sums doc_type = Invoice to avoid double-counting.
Credit Memo applications are tracked separately in credit_memo_applications_total.';

COMMENT ON FUNCTION get_invoice_only_payment_total(UUID[]) IS
'Returns the sum of payment applications where doc_type = Invoice only.
Use this for accurate "total money applied to invoices" calculations.
Pass NULL for all payments, or an array of payment_ids to filter.';

COMMENT ON FUNCTION get_customer_invoice_payments_total(TEXT) IS
'Returns total payments applied to invoices for a specific customer.
Only sums doc_type = Invoice to avoid Credit Memo double-counting.';

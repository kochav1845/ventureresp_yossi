/*
  # Create Fast Payment Analytics Function

  1. New Functions
    - `get_payments_with_applications` - Fast function to fetch payments with their applications in a single query
    - Uses proper JOINs and aggregations
    - Returns only necessary columns (excludes heavy raw_data field)

  2. Performance
    - Single query instead of N+1 queries
    - Uses existing indexes
    - Aggregates applications in database
    - Returns summary statistics

  3. Changes
    - Replaces client-side batch loading with server-side aggregation
    - Significantly faster for large datasets
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_payments_with_applications(date, date);

-- Create optimized function to get payments with applications
CREATE OR REPLACE FUNCTION get_payments_with_applications(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id integer,
  reference_number text,
  type text,
  status text,
  hold boolean,
  application_date date,
  payment_amount numeric,
  available_balance numeric,
  customer_id text,
  customer_name text,
  payment_method text,
  payment_ref text,
  description text,
  invoice_applications jsonb,
  total_applied numeric,
  application_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH payment_apps AS (
    SELECT
      pia.payment_id,
      jsonb_agg(
        jsonb_build_object(
          'invoice_reference_number', pia.invoice_reference_number,
          'doc_type', pia.doc_type,
          'amount_paid', pia.amount_paid,
          'application_date', pia.application_date
        ) ORDER BY pia.application_date DESC
      ) as applications,
      SUM(CASE WHEN pia.doc_type = 'Invoice' THEN pia.amount_paid ELSE 0 END) as total_applied,
      COUNT(*) as app_count
    FROM payment_invoice_applications pia
    GROUP BY pia.payment_id
  )
  SELECT
    p.id,
    p.reference_number,
    p.type,
    p.status,
    p.hold,
    p.application_date,
    p.payment_amount,
    p.available_balance,
    p.customer_id,
    COALESCE(c.customer_name, p.customer_name, p.customer_id) as customer_name,
    p.payment_method,
    p.payment_ref,
    p.description,
    COALESCE(pa.applications, '[]'::jsonb) as invoice_applications,
    COALESCE(pa.total_applied, 0) as total_applied,
    COALESCE(pa.app_count, 0)::integer as application_count
  FROM acumatica_payments p
  LEFT JOIN payment_apps pa ON pa.payment_id = p.id
  LEFT JOIN acumatica_customers c ON c.customer_id = p.customer_id
  WHERE p.application_date >= p_start_date
    AND p.application_date < p_end_date
    AND p.type != 'Credit Memo'
  ORDER BY p.application_date DESC, p.id DESC;
END;
$$;

-- Create function to get payment summary statistics
CREATE OR REPLACE FUNCTION get_payment_summary_stats(
  p_start_date date,
  p_end_date date,
  p_excluded_customers text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  total_amount numeric,
  payment_count bigint,
  unique_customer_count bigint,
  avg_payment_amount numeric,
  payment_types jsonb,
  payment_methods jsonb,
  status_breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_payments AS (
    SELECT
      p.payment_amount,
      p.customer_id,
      p.type,
      p.payment_method,
      p.status
    FROM acumatica_payments p
    WHERE p.application_date >= p_start_date
      AND p.application_date < p_end_date
      AND p.type != 'Credit Memo'
      AND (p_excluded_customers = ARRAY[]::text[] OR p.customer_id != ALL(p_excluded_customers))
  ),
  type_stats AS (
    SELECT
      type,
      COUNT(*) as count,
      SUM(payment_amount) as total
    FROM filtered_payments
    GROUP BY type
  ),
  method_stats AS (
    SELECT
      payment_method,
      COUNT(*) as count,
      SUM(payment_amount) as total
    FROM filtered_payments
    GROUP BY payment_method
  ),
  status_stats AS (
    SELECT
      status,
      COUNT(*) as count,
      SUM(payment_amount) as total
    FROM filtered_payments
    GROUP BY status
  )
  SELECT
    COALESCE(SUM(fp.payment_amount), 0) as total_amount,
    COUNT(*) as payment_count,
    COUNT(DISTINCT fp.customer_id) as unique_customer_count,
    COALESCE(AVG(fp.payment_amount), 0) as avg_payment_amount,
    (SELECT jsonb_object_agg(type, jsonb_build_object('count', count, 'total', total)) FROM type_stats) as payment_types,
    (SELECT jsonb_object_agg(payment_method, jsonb_build_object('count', count, 'total', total)) FROM method_stats) as payment_methods,
    (SELECT jsonb_object_agg(status, jsonb_build_object('count', count, 'total', total)) FROM status_stats) as status_breakdown
  FROM filtered_payments fp;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_payments_with_applications(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_summary_stats(date, date, text[]) TO authenticated;

-- Create indexes for better performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_payments_application_date_type
  ON acumatica_payments(application_date DESC, type)
  WHERE type != 'Credit Memo';

CREATE INDEX IF NOT EXISTS idx_payment_apps_payment_id
  ON payment_invoice_applications(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_apps_doc_type_amount
  ON payment_invoice_applications(payment_id, doc_type, amount_paid);

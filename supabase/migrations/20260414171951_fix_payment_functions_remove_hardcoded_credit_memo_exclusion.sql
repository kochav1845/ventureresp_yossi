/*
  # Fix payment functions to support all payment type filtering

  1. Modified Functions
    - `get_payments_with_applications` - Removed hardcoded `type != 'Credit Memo'` exclusion.
      Now accepts optional `p_type` parameter so the caller controls which types to include.
    - `get_payment_summary_stats` - Same change: removed hardcoded exclusion,
      added `p_type` parameter for explicit filtering.

  2. Why
    - Previously, Credit Memos were always excluded at the database level,
      making it impossible to filter for Credit Memos in the UI.
    - Now the frontend decides which types to include via the p_type parameter.
    - When p_type is NULL and p_exclude_credit_memos is true, Credit Memos are excluded (default behavior).

  3. Notes
    - Backward compatible: existing callers that don't pass p_type or p_exclude_credit_memos
      get the same behavior (Credit Memos excluded by default).
*/

-- Drop existing functions first
DROP FUNCTION IF EXISTS get_payments_with_applications(date, date);
DROP FUNCTION IF EXISTS get_payment_summary_stats(date, date, text[]);

CREATE OR REPLACE FUNCTION get_payments_with_applications(
  p_start_date date,
  p_end_date date,
  p_type text DEFAULT NULL,
  p_exclude_credit_memos boolean DEFAULT true
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
    AND (p_type IS NOT NULL AND p.type = p_type
         OR p_type IS NULL AND (NOT p_exclude_credit_memos OR p.type != 'Credit Memo'))
  ORDER BY p.application_date DESC, p.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_payment_summary_stats(
  p_start_date date,
  p_end_date date,
  p_excluded_customers text[] DEFAULT ARRAY[]::text[],
  p_type text DEFAULT NULL,
  p_exclude_credit_memos boolean DEFAULT true
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
      AND (p_type IS NOT NULL AND p.type = p_type
           OR p_type IS NULL AND (NOT p_exclude_credit_memos OR p.type != 'Credit Memo'))
      AND (p_excluded_customers = ARRAY[]::text[] OR p.customer_id != ALL(p_excluded_customers))
  ),
  type_stats AS (
    SELECT
      fp.type,
      COUNT(*) as count,
      SUM(fp.payment_amount) as total
    FROM filtered_payments fp
    GROUP BY fp.type
  ),
  method_stats AS (
    SELECT
      fp.payment_method,
      COUNT(*) as count,
      SUM(fp.payment_amount) as total
    FROM filtered_payments fp
    GROUP BY fp.payment_method
  ),
  status_stats AS (
    SELECT
      fp.status,
      COUNT(*) as count,
      SUM(fp.payment_amount) as total
    FROM filtered_payments fp
    GROUP BY fp.status
  )
  SELECT
    COALESCE(SUM(fp.payment_amount), 0) as total_amount,
    COUNT(*) as payment_count,
    COUNT(DISTINCT fp.customer_id) as unique_customer_count,
    COALESCE(AVG(fp.payment_amount), 0) as avg_payment_amount,
    (SELECT jsonb_object_agg(ts.type, jsonb_build_object('count', ts.count, 'total', ts.total)) FROM type_stats ts) as payment_types,
    (SELECT jsonb_object_agg(ms.payment_method, jsonb_build_object('count', ms.count, 'total', ms.total)) FROM method_stats ms) as payment_methods,
    (SELECT jsonb_object_agg(ss.status, jsonb_build_object('count', ss.count, 'total', ss.total)) FROM status_stats ss) as status_breakdown
  FROM filtered_payments fp;
END;
$$;

GRANT EXECUTE ON FUNCTION get_payments_with_applications(date, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_summary_stats(date, date, text[], text, boolean) TO authenticated;

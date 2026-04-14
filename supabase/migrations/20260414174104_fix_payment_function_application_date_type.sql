/*
  # Fix application_date return type in get_payments_with_applications

  1. Changes
    - Changed `application_date` return type from `date` to `timestamptz`
      to match the actual column type in `acumatica_payments`.
*/

DROP FUNCTION IF EXISTS get_payments_with_applications(date, date, text, boolean);

CREATE OR REPLACE FUNCTION get_payments_with_applications(
  p_start_date date,
  p_end_date date,
  p_type text DEFAULT NULL,
  p_exclude_credit_memos boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  reference_number text,
  type text,
  status text,
  hold boolean,
  application_date timestamptz,
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

GRANT EXECUTE ON FUNCTION get_payments_with_applications(date, date, text, boolean) TO authenticated;

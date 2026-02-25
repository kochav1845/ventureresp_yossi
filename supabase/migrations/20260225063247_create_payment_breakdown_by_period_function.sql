/*
  # Create Payment Breakdown by Period Function

  1. New Functions
    - `get_payment_breakdown_by_month` - Returns payment counts and totals grouped by month and type
    - `get_payment_breakdown_by_date` - Returns payment counts and totals grouped by date and type for a given month

  2. Purpose
    - Enable month-over-month comparison of payment types (Payment, Prepayment, Voided Payment, etc.)
    - Allow drill-down from monthly view to daily breakdown
    - All amounts are aggregated by type and status
*/

CREATE OR REPLACE FUNCTION get_payment_breakdown_by_month(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  month_key text,
  month_label text,
  payment_type text,
  payment_status text,
  payment_count bigint,
  total_amount numeric,
  avg_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(p.application_date::date, 'YYYY-MM') AS month_key,
    to_char(p.application_date::date, 'Mon YYYY') AS month_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE p.application_date IS NOT NULL
    AND (p_start_date IS NULL OR p.application_date::date >= p_start_date)
    AND (p_end_date IS NULL OR p.application_date::date <= p_end_date)
  GROUP BY
    to_char(p.application_date::date, 'YYYY-MM'),
    to_char(p.application_date::date, 'Mon YYYY'),
    p.type,
    p.status
  ORDER BY month_key DESC, payment_type, payment_status;
END;
$$;

CREATE OR REPLACE FUNCTION get_payment_breakdown_by_date(
  p_year int,
  p_month int
)
RETURNS TABLE (
  day_date date,
  day_label text,
  payment_type text,
  payment_status text,
  payment_count bigint,
  total_amount numeric,
  avg_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  RETURN QUERY
  SELECT
    p.application_date::date AS day_date,
    to_char(p.application_date::date, 'Mon DD, YYYY') AS day_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE p.application_date IS NOT NULL
    AND p.application_date::date >= v_start
    AND p.application_date::date <= v_end
  GROUP BY
    p.application_date::date,
    to_char(p.application_date::date, 'Mon DD, YYYY'),
    p.type,
    p.status
  ORDER BY day_date DESC, payment_type, payment_status;
END;
$$;

CREATE OR REPLACE FUNCTION get_payment_month_summary()
RETURNS TABLE (
  month_key text,
  month_label text,
  total_payments bigint,
  total_amount numeric,
  payment_count bigint,
  payment_amount numeric,
  prepayment_count bigint,
  prepayment_amount numeric,
  voided_count bigint,
  voided_amount numeric,
  refund_count bigint,
  refund_amount numeric,
  balance_wo_count bigint,
  balance_wo_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(p.application_date::date, 'YYYY-MM') AS month_key,
    to_char(p.application_date::date, 'Mon YYYY') AS month_label,
    COUNT(*)::bigint AS total_payments,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COUNT(*) FILTER (WHERE p.type = 'Payment')::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Payment'), 0) AS payment_amount,
    COUNT(*) FILTER (WHERE p.type = 'Prepayment')::bigint AS prepayment_count,
    COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Prepayment'), 0) AS prepayment_amount,
    COUNT(*) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check'))::bigint AS voided_count,
    COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check')), 0) AS voided_amount,
    COUNT(*) FILTER (WHERE p.type = 'Refund')::bigint AS refund_count,
    COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Refund'), 0) AS refund_amount,
    COUNT(*) FILTER (WHERE p.type = 'Balance WO')::bigint AS balance_wo_count,
    COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Balance WO'), 0) AS balance_wo_amount
  FROM acumatica_payments p
  WHERE p.application_date IS NOT NULL
  GROUP BY
    to_char(p.application_date::date, 'YYYY-MM'),
    to_char(p.application_date::date, 'Mon YYYY')
  ORDER BY month_key DESC;
END;
$$;

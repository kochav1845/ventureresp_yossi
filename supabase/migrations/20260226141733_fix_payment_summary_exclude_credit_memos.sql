/*
  # Fix payment summary and breakdown to exclude Credit Memos

  1. Changes
    - Update `get_payment_month_summary` to exclude Credit Memo type
    - Update `get_payment_breakdown_by_date` to exclude Credit Memo type
    - This makes both functions consistent with the Acumatica comparison query
      which also excludes Credit Memos (`Type ne 'Credit Memo'`)
    - Previously, the month summary showed a higher count (e.g., 777) while the
      sync comparison showed a lower count (e.g., 747) because Credit Memos were
      included in the summary but excluded in the comparison

  2. Impact
    - Month-level totals will now match the sync check DB count exactly
    - Daily breakdown will also exclude Credit Memos for consistency
*/

CREATE OR REPLACE FUNCTION get_payment_month_summary()
RETURNS TABLE(
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
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  AND p.type != 'Credit Memo'
GROUP BY
  to_char(p.application_date::date, 'YYYY-MM'),
  to_char(p.application_date::date, 'Mon YYYY')
ORDER BY month_key DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_payment_breakdown_by_date(p_year integer, p_month integer)
RETURNS TABLE(
  day_date date,
  day_label text,
  payment_type text,
  payment_status text,
  payment_count bigint,
  total_amount numeric,
  avg_amount numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    AND p.type != 'Credit Memo'
  GROUP BY
    p.application_date::date,
    to_char(p.application_date::date, 'Mon DD, YYYY'),
    p.type,
    p.status
  ORDER BY day_date DESC, payment_type, payment_status;
END;
$$;

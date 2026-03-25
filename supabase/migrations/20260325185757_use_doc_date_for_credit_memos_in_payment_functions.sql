/*
  # Use doc_date for credit memos in all payment breakdown functions

  1. Changes
    - Updated `get_payment_month_summary` to use COALESCE(doc_date, application_date) as effective date
    - Updated `get_payment_breakdown_by_date` to use COALESCE(doc_date, application_date) as effective date
    - Updated `get_payment_breakdown_by_month` to use COALESCE(doc_date, application_date) as effective date
    - Updated `get_payment_counts_by_type` to use COALESCE(doc_date, application_date) as effective date

  2. Why
    - For credit memos, `application_date` is the Adjustment Date (when it was last applied to documents)
    - `doc_date` is the actual Document Date (when the credit memo was created)
    - Example: Credit Memo 041580 has application_date = 2026-02-11 but doc_date = 2023-08-29
    - Using doc_date ensures credit memos appear under their correct month in the breakdown

  3. Important Notes
    - For non-credit-memo types, doc_date is NULL so COALESCE falls back to application_date
    - This only affects credit memos where doc_date has been backfilled
*/

-- Update get_payment_month_summary
DROP FUNCTION IF EXISTS public.get_payment_month_summary();

CREATE OR REPLACE FUNCTION public.get_payment_month_summary()
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
  balance_wo_amount numeric,
  credit_memo_count bigint,
  credit_memo_amount numeric,
  voided_refund_count bigint,
  voided_refund_amount numeric,
  debit_memo_count bigint,
  debit_memo_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT
  to_char(COALESCE(p.doc_date, p.application_date)::date, 'YYYY-MM') AS month_key,
  to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon YYYY') AS month_label,
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
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Balance WO'), 0) AS balance_wo_amount,
  COUNT(*) FILTER (WHERE p.type = 'Credit Memo')::bigint AS credit_memo_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Credit Memo'), 0) AS credit_memo_amount,
  COUNT(*) FILTER (WHERE p.type = 'Voided Refund')::bigint AS voided_refund_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Voided Refund'), 0) AS voided_refund_amount,
  COUNT(*) FILTER (WHERE p.type = 'Debit Memo')::bigint AS debit_memo_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Debit Memo'), 0) AS debit_memo_amount
FROM acumatica_payments p
WHERE COALESCE(p.doc_date, p.application_date) IS NOT NULL
GROUP BY
  to_char(COALESCE(p.doc_date, p.application_date)::date, 'YYYY-MM'),
  to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon YYYY')
ORDER BY month_key DESC;
END;
$function$;

-- Update get_payment_breakdown_by_date
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
    COALESCE(p.doc_date, p.application_date)::date AS day_date,
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon DD, YYYY') AS day_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE COALESCE(p.doc_date, p.application_date) IS NOT NULL
    AND COALESCE(p.doc_date, p.application_date)::date >= v_start
    AND COALESCE(p.doc_date, p.application_date)::date <= v_end
  GROUP BY
    COALESCE(p.doc_date, p.application_date)::date,
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon DD, YYYY'),
    p.type,
    p.status
  ORDER BY day_date DESC, payment_type, payment_status;
END;
$$;

-- Update get_payment_breakdown_by_month
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
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'YYYY-MM') AS month_key,
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon YYYY') AS month_label,
    COALESCE(p.type, 'Unknown') AS payment_type,
    COALESCE(p.status, 'Unknown') AS payment_status,
    COUNT(*)::bigint AS payment_count,
    COALESCE(SUM(p.payment_amount::numeric), 0) AS total_amount,
    COALESCE(AVG(p.payment_amount::numeric), 0) AS avg_amount
  FROM acumatica_payments p
  WHERE COALESCE(p.doc_date, p.application_date) IS NOT NULL
    AND (p_start_date IS NULL OR COALESCE(p.doc_date, p.application_date)::date >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(p.doc_date, p.application_date)::date <= p_end_date)
  GROUP BY
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'YYYY-MM'),
    to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon YYYY'),
    p.type,
    p.status
  ORDER BY month_key DESC, payment_type, payment_status;
END;
$$;

-- Update get_payment_counts_by_type
CREATE OR REPLACE FUNCTION get_payment_counts_by_type(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE(payment_type text, type_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    type AS payment_type,
    count(*) AS type_count
  FROM acumatica_payments
  WHERE COALESCE(doc_date, application_date) >= p_start_date::timestamptz
    AND COALESCE(doc_date, application_date) <= p_end_date::timestamptz
  GROUP BY type
  ORDER BY type_count DESC;
$$;

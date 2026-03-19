/*
  # Add Debit Memo type to payment month summary

  1. Changes
    - Updated `get_payment_month_summary` function to include `debit_memo_count` and `debit_memo_amount` columns
    - This allows the payment breakdown dashboard to display Debit Memo transactions alongside other payment types

  2. Notes
    - Debit Memos in Acumatica are used to offset Credit Memos or increase customer balances
    - Previously these were not tracked in the monthly summary, causing discrepancies in sync comparisons
*/

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
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Balance WO'), 0) AS balance_wo_amount,
  COUNT(*) FILTER (WHERE p.type = 'Credit Memo')::bigint AS credit_memo_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Credit Memo'), 0) AS credit_memo_amount,
  COUNT(*) FILTER (WHERE p.type = 'Voided Refund')::bigint AS voided_refund_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Voided Refund'), 0) AS voided_refund_amount,
  COUNT(*) FILTER (WHERE p.type = 'Debit Memo')::bigint AS debit_memo_count,
  COALESCE(SUM(p.payment_amount::numeric) FILTER (WHERE p.type = 'Debit Memo'), 0) AS debit_memo_amount
FROM acumatica_payments p
WHERE p.application_date IS NOT NULL
GROUP BY
  to_char(p.application_date::date, 'YYYY-MM'),
  to_char(p.application_date::date, 'Mon YYYY')
ORDER BY month_key DESC;
END;
$function$;

/*
  # Create materialized view for payment month summary

  1. Changes
    - Create materialized view `mv_payment_month_summary` with pre-computed monthly aggregates
    - Add unique index on month_key for concurrent refresh
    - Rewrite `get_payment_month_summary()` to read from the materialized view (instant)
    - Add function `refresh_payment_month_summary()` to refresh the view
    - Schedule refresh every 10 minutes via cron
    - Do an initial refresh

  2. Why
    - The previous function did a full table scan + aggregation on 32K+ wide rows
    - This caused statement timeouts when called via the REST API
    - Materialized view pre-computes the result; reads are instant
*/

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_payment_month_summary AS
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
  to_char(COALESCE(p.doc_date, p.application_date)::date, 'Mon YYYY');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_payment_month_summary_key
  ON mv_payment_month_summary (month_key);

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
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    mv.month_key,
    mv.month_label,
    mv.total_payments,
    mv.total_amount,
    mv.payment_count,
    mv.payment_amount,
    mv.prepayment_count,
    mv.prepayment_amount,
    mv.voided_count,
    mv.voided_amount,
    mv.refund_count,
    mv.refund_amount,
    mv.balance_wo_count,
    mv.balance_wo_amount,
    mv.credit_memo_count,
    mv.credit_memo_amount,
    mv.voided_refund_count,
    mv.voided_refund_amount,
    mv.debit_memo_count,
    mv.debit_memo_amount
  FROM mv_payment_month_summary mv
  ORDER BY mv.month_key DESC;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payment_month_summary;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-payment-month-summary');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-payment-month-summary',
  '*/10 * * * *',
  'SELECT public.refresh_payment_month_summary();'
);
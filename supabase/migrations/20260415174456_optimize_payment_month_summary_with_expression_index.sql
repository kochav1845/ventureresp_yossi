/*
  # Optimize get_payment_month_summary performance

  1. Changes
    - Add immutable helper function for effective payment date
    - Add expression indexes using the helper function
    - Rewrite get_payment_month_summary as pure SQL for better query optimization
    - Pre-compute effective date and cast amount once in CTE to avoid repeated work

  2. Why
    - The function was timing out via the REST API due to repeated COALESCE + to_char
      computation on 32K+ rows with no supporting index
    - Pure SQL functions allow the planner to inline and optimize better than plpgsql
*/

CREATE OR REPLACE FUNCTION public.payment_effective_date(doc_date timestamptz, app_date timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(doc_date, app_date)::date;
$$;

CREATE INDEX IF NOT EXISTS idx_payments_effective_date
  ON acumatica_payments (public.payment_effective_date(doc_date, application_date));

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
  WITH monthly AS (
    SELECT
      to_char(public.payment_effective_date(p.doc_date, p.application_date), 'YYYY-MM') AS mk,
      to_char(public.payment_effective_date(p.doc_date, p.application_date), 'Mon YYYY') AS ml,
      p.type,
      p.payment_amount::numeric AS amt
    FROM acumatica_payments p
    WHERE public.payment_effective_date(p.doc_date, p.application_date) IS NOT NULL
  )
  SELECT
    mk AS month_key,
    ml AS month_label,
    COUNT(*)::bigint AS total_payments,
    COALESCE(SUM(amt), 0) AS total_amount,
    COUNT(*) FILTER (WHERE type = 'Payment')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Payment'), 0),
    COUNT(*) FILTER (WHERE type = 'Prepayment')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Prepayment'), 0),
    COUNT(*) FILTER (WHERE type IN ('Voided Payment', 'Voided Check'))::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type IN ('Voided Payment', 'Voided Check')), 0),
    COUNT(*) FILTER (WHERE type = 'Refund')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Refund'), 0),
    COUNT(*) FILTER (WHERE type = 'Balance WO')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Balance WO'), 0),
    COUNT(*) FILTER (WHERE type = 'Credit Memo')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Credit Memo'), 0),
    COUNT(*) FILTER (WHERE type = 'Voided Refund')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Voided Refund'), 0),
    COUNT(*) FILTER (WHERE type = 'Debit Memo')::bigint,
    COALESCE(SUM(amt) FILTER (WHERE type = 'Debit Memo'), 0)
  FROM monthly
  GROUP BY mk, ml
  ORDER BY mk DESC;
$$;
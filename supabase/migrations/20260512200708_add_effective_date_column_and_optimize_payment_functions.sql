/*
  # Add effective_date column and optimize payment analytics functions

  1. Problem
    - payment_effective_date() function called per-row in WHERE/GROUP BY
    - 33K rows x multiple function calls = 11+ second queries that timeout
    - mv_payment_month_summary REFRESH CONCURRENTLY also times out

  2. Changes
    - Add `effective_date` stored column to acumatica_payments
    - Backfill from COALESCE(doc_date, application_date)
    - Add trigger to auto-maintain on INSERT/UPDATE
    - Add btree index on effective_date for fast range scans
    - Rewrite get_payments_for_analytics to use plain column
    - Rewrite get_filtered_payment_aggregates to use plain column
    - Replace mv_payment_month_summary matview with incremental table
    - Rewrite refresh_payment_month_summary to batch by year

  3. Impact
    - Queries go from 11s+ to sub-second (index scan on plain column)
    - No API changes -- same function signatures and return types
*/

-- 1. Add effective_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'effective_date'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN effective_date date;
  END IF;
END $$;

-- 2. Backfill
UPDATE acumatica_payments
SET effective_date = COALESCE(doc_date, application_date)::date
WHERE effective_date IS NULL;

-- 3. Trigger to auto-maintain
CREATE OR REPLACE FUNCTION set_payment_effective_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.effective_date := COALESCE(NEW.doc_date, NEW.application_date)::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_payment_effective_date ON acumatica_payments;
CREATE TRIGGER trg_set_payment_effective_date
  BEFORE INSERT OR UPDATE OF doc_date, application_date
  ON acumatica_payments
  FOR EACH ROW
  EXECUTE FUNCTION set_payment_effective_date();

-- 4. Indexes on new column
CREATE INDEX IF NOT EXISTS idx_payments_effective_date_plain
  ON acumatica_payments (effective_date);

CREATE INDEX IF NOT EXISTS idx_payments_effective_date_type
  ON acumatica_payments (effective_date, type);

CREATE INDEX IF NOT EXISTS idx_payments_eff_date_analytics
  ON acumatica_payments (effective_date, type, payment_amount, customer_id, status, payment_method)
  WHERE effective_date IS NOT NULL;

-- 5. Rewrite get_payments_for_analytics to use plain column
DROP FUNCTION IF EXISTS get_payments_for_analytics(date, date, text[]);

CREATE FUNCTION get_payments_for_analytics(
  p_start_date date,
  p_end_date date,
  p_excluded_types text[]
)
RETURNS TABLE(
  effective_date text,
  payment_amount text,
  customer_id text,
  type text,
  payment_method text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.effective_date::text,
    p.payment_amount::text,
    p.customer_id,
    p.type,
    p.payment_method,
    p.status
  FROM acumatica_payments p
  WHERE p.effective_date >= p_start_date
    AND p.effective_date <= p_end_date
    AND p.type != ALL(p_excluded_types);
$$;

-- 6. Rewrite get_filtered_payment_aggregates to use plain column
DROP FUNCTION IF EXISTS get_filtered_payment_aggregates(text, integer, text, text, text, text, text[]);

CREATE FUNCTION get_filtered_payment_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_has_applications text DEFAULT NULL,
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE(
  agg_year integer,
  agg_month integer,
  total_amount numeric,
  payment_count bigint,
  unique_customers bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_year_start date;
  v_year_end date;
BEGIN
  IF p_period_type = 'monthly' AND p_year IS NOT NULL THEN
    v_year_start := make_date(p_year, 1, 1);
    v_year_end := make_date(p_year, 12, 31);
  END IF;

  IF p_has_applications IS NOT NULL THEN
    RETURN QUERY
    WITH payments_with_apps AS (
      SELECT DISTINCT pia.payment_id
      FROM payment_invoice_applications pia
    ),
    filtered_payments AS (
      SELECT
        p.id,
        EXTRACT(YEAR FROM p.effective_date)::int AS yr,
        EXTRACT(MONTH FROM p.effective_date)::int AS mo,
        p.payment_amount::numeric AS amt,
        p.customer_id AS cid
      FROM acumatica_payments p
      LEFT JOIN payments_with_apps pwa ON pwa.payment_id = p.id
      WHERE
        p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_type IS NULL OR p.type = p_type)
        AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
        AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
        AND (
          (p_has_applications = 'has_applications' AND pwa.payment_id IS NOT NULL)
          OR (p_has_applications = 'no_applications' AND pwa.payment_id IS NULL)
        )
        AND (
          p_period_type = 'yearly'
          OR (v_year_start IS NOT NULL AND p.effective_date >= v_year_start AND p.effective_date <= v_year_end)
        )
    )
    SELECT
      fp.yr,
      CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END,
      COALESCE(SUM(fp.amt), 0),
      COUNT(*),
      COUNT(DISTINCT fp.cid)
    FROM filtered_payments fp
    GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
    ORDER BY fp.yr DESC, 2 ASC;
  ELSE
    RETURN QUERY
    WITH filtered_payments AS (
      SELECT
        p.id,
        EXTRACT(YEAR FROM p.effective_date)::int AS yr,
        EXTRACT(MONTH FROM p.effective_date)::int AS mo,
        p.payment_amount::numeric AS amt,
        p.customer_id AS cid
      FROM acumatica_payments p
      WHERE
        p.type NOT IN ('Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return')
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_type IS NULL OR p.type = p_type)
        AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
        AND (p_excluded_customers = '{}' OR p.customer_id != ALL(p_excluded_customers))
        AND (
          p_period_type = 'yearly'
          OR (v_year_start IS NOT NULL AND p.effective_date >= v_year_start AND p.effective_date <= v_year_end)
        )
    )
    SELECT
      fp.yr,
      CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END,
      COALESCE(SUM(fp.amt), 0),
      COUNT(*),
      COUNT(DISTINCT fp.cid)
    FROM filtered_payments fp
    GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL END
    ORDER BY fp.yr DESC, 2 ASC;
  END IF;
END;
$$;

-- 7. Create payment_month_summary table to replace matview
CREATE TABLE IF NOT EXISTS payment_month_summary (
  month_key text PRIMARY KEY,
  month_label text NOT NULL,
  total_payments bigint DEFAULT 0,
  total_amount numeric DEFAULT 0,
  payment_count bigint DEFAULT 0,
  payment_amount numeric DEFAULT 0,
  prepayment_count bigint DEFAULT 0,
  prepayment_amount numeric DEFAULT 0,
  voided_count bigint DEFAULT 0,
  voided_amount numeric DEFAULT 0,
  refund_count bigint DEFAULT 0,
  refund_amount numeric DEFAULT 0,
  balance_wo_count bigint DEFAULT 0,
  balance_wo_amount numeric DEFAULT 0,
  credit_memo_count bigint DEFAULT 0,
  credit_memo_amount numeric DEFAULT 0,
  voided_refund_count bigint DEFAULT 0,
  voided_refund_amount numeric DEFAULT 0,
  debit_memo_count bigint DEFAULT 0,
  debit_memo_amount numeric DEFAULT 0
);

ALTER TABLE payment_month_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payment month summary"
  ON payment_month_summary
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed from existing matview
INSERT INTO payment_month_summary
SELECT * FROM mv_payment_month_summary
ON CONFLICT (month_key) DO NOTHING;

-- 8. Rewrite refresh function
CREATE OR REPLACE FUNCTION refresh_payment_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5min'
AS $$
DECLARE
  v_year integer;
  v_min_year integer;
  v_max_year integer;
BEGIN
  SELECT
    EXTRACT(YEAR FROM MIN(effective_date))::integer,
    EXTRACT(YEAR FROM MAX(effective_date))::integer
  INTO v_min_year, v_max_year
  FROM acumatica_payments
  WHERE effective_date IS NOT NULL;

  IF v_min_year IS NULL THEN
    RETURN;
  END IF;

  FOR v_year IN v_min_year..v_max_year LOOP
    INSERT INTO payment_month_summary (
      month_key, month_label,
      total_payments, total_amount,
      payment_count, payment_amount,
      prepayment_count, prepayment_amount,
      voided_count, voided_amount,
      refund_count, refund_amount,
      balance_wo_count, balance_wo_amount,
      credit_memo_count, credit_memo_amount,
      voided_refund_count, voided_refund_amount,
      debit_memo_count, debit_memo_amount
    )
    SELECT
      to_char(p.effective_date::timestamp, 'YYYY-MM'),
      to_char(p.effective_date::timestamp, 'Mon YYYY'),
      count(*),
      COALESCE(sum(p.payment_amount), 0),
      count(*) FILTER (WHERE p.type = 'Payment'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Payment'), 0),
      count(*) FILTER (WHERE p.type = 'Prepayment'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Prepayment'), 0),
      count(*) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check')),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check')), 0),
      count(*) FILTER (WHERE p.type = 'Refund'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Refund'), 0),
      count(*) FILTER (WHERE p.type = 'Balance WO'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Balance WO'), 0),
      count(*) FILTER (WHERE p.type = 'Credit Memo'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Credit Memo'), 0),
      count(*) FILTER (WHERE p.type = 'Voided Refund'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Voided Refund'), 0),
      count(*) FILTER (WHERE p.type = 'Debit Memo'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Debit Memo'), 0)
    FROM acumatica_payments p
    WHERE EXTRACT(YEAR FROM p.effective_date) = v_year
      AND p.effective_date IS NOT NULL
    GROUP BY to_char(p.effective_date::timestamp, 'YYYY-MM'), to_char(p.effective_date::timestamp, 'Mon YYYY')
    ON CONFLICT (month_key) DO UPDATE SET
      month_label = EXCLUDED.month_label,
      total_payments = EXCLUDED.total_payments,
      total_amount = EXCLUDED.total_amount,
      payment_count = EXCLUDED.payment_count,
      payment_amount = EXCLUDED.payment_amount,
      prepayment_count = EXCLUDED.prepayment_count,
      prepayment_amount = EXCLUDED.prepayment_amount,
      voided_count = EXCLUDED.voided_count,
      voided_amount = EXCLUDED.voided_amount,
      refund_count = EXCLUDED.refund_count,
      refund_amount = EXCLUDED.refund_amount,
      balance_wo_count = EXCLUDED.balance_wo_count,
      balance_wo_amount = EXCLUDED.balance_wo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      voided_refund_count = EXCLUDED.voided_refund_count,
      voided_refund_amount = EXCLUDED.voided_refund_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount;
  END LOOP;
END;
$$;

-- 9. Rewrite read function to use new table
DROP FUNCTION IF EXISTS get_payment_month_summary();

CREATE FUNCTION get_payment_month_summary()
RETURNS SETOF payment_month_summary
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM payment_month_summary ORDER BY month_key DESC;
$$;
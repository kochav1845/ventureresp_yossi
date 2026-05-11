/*
  # Create Cached Invoice Analytics Table

  1. New Tables
    - `cached_invoice_analytics`
      - `id` (uuid, primary key)
      - `period_type` (text) - 'daily', 'monthly', or 'yearly'
      - `year` (integer) - year of the period
      - `month` (integer, nullable) - month (1-12), null for yearly
      - `day` (integer, nullable) - day (1-31), null for monthly/yearly
      - `date` (date, nullable) - actual date for daily records
      - `total_amount` (numeric) - sum of all invoice amounts
      - `total_balance` (numeric) - sum of all invoice balances
      - `total_open_balance` (numeric) - sum of open invoice balances
      - `invoice_count` (integer) - total number of invoices
      - `unique_customer_count` (integer) - unique customers
      - `invoice_only_amount` (numeric) - Invoice type only
      - `invoice_only_count` (integer)
      - `credit_memo_amount` (numeric) - Credit Memo type only
      - `credit_memo_count` (integer)
      - `debit_memo_amount` (numeric) - Debit Memo type only
      - `debit_memo_count` (integer)
      - `type_amounts` (jsonb) - per-type breakdown
      - `status_breakdown` (jsonb) - per-status breakdown
      - `calculated_at` (timestamptz) - when the cache was computed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `cached_invoice_analytics` table
    - Authenticated users can read
    - Service role manages writes

  3. Function
    - `refresh_cached_invoice_analytics()` - computes and upserts invoice analytics
*/

-- Create cached_invoice_analytics table
CREATE TABLE IF NOT EXISTS cached_invoice_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('daily', 'monthly', 'yearly')),
  year integer,
  month integer,
  day integer,
  date date,
  total_amount numeric DEFAULT 0,
  total_balance numeric DEFAULT 0,
  total_open_balance numeric DEFAULT 0,
  invoice_count integer DEFAULT 0,
  unique_customer_count integer DEFAULT 0,
  invoice_only_amount numeric DEFAULT 0,
  invoice_only_count integer DEFAULT 0,
  credit_memo_amount numeric DEFAULT 0,
  credit_memo_count integer DEFAULT 0,
  debit_memo_amount numeric DEFAULT 0,
  debit_memo_count integer DEFAULT 0,
  type_amounts jsonb DEFAULT '{}',
  status_breakdown jsonb DEFAULT '{}',
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_cached_invoice_analytics_unique
  ON cached_invoice_analytics (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cached_invoice_analytics_period
  ON cached_invoice_analytics (period_type, year, month);

ALTER TABLE cached_invoice_analytics ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read cached invoice analytics"
  ON cached_invoice_analytics
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Service role can manage (inserts/updates happen via edge functions)
CREATE POLICY "Service role can manage cached invoice analytics"
  ON cached_invoice_analytics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to refresh cached invoice analytics for a given period
CREATE OR REPLACE FUNCTION refresh_cached_invoice_analytics(
  p_period_type text DEFAULT 'monthly',
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_rows_affected integer := 0;
  v_target_year integer;
  v_start_date date;
  v_end_date date;
BEGIN
  v_target_year := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);

  IF p_period_type = 'daily' THEN
    -- Calculate daily aggregates for a specific month
    v_start_date := make_date(v_target_year, COALESCE(p_month, EXTRACT(MONTH FROM now())::integer), 1);
    v_end_date := (v_start_date + interval '1 month')::date;

    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'daily',
      EXTRACT(YEAR FROM i.date::date)::integer,
      EXTRACT(MONTH FROM i.date::date)::integer,
      EXTRACT(DAY FROM i.date::date)::integer,
      i.date::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      jsonb_object_agg(
        COALESCE(sub.inv_type, 'Unknown'),
        jsonb_build_object('count', sub.type_count, 'amount', sub.type_amount)
      ) FILTER (WHERE sub.inv_type IS NOT NULL),
      jsonb_object_agg(
        COALESCE(sub_s.inv_status, 'Unknown'),
        jsonb_build_object('count', sub_s.status_count, 'amount', sub_s.status_amount)
      ) FILTER (WHERE sub_s.inv_status IS NOT NULL),
      now(),
      now()
    FROM acumatica_invoices i
    LEFT JOIN LATERAL (
      SELECT i2.type AS inv_type, COUNT(*) AS type_count, SUM(i2.amount) AS type_amount
      FROM acumatica_invoices i2
      WHERE i2.date::date = i.date::date AND i2.status != 'On Hold'
      GROUP BY i2.type
      LIMIT 1
    ) sub ON true
    LEFT JOIN LATERAL (
      SELECT i3.status AS inv_status, COUNT(*) AS status_count, SUM(i3.amount) AS status_amount
      FROM acumatica_invoices i3
      WHERE i3.date::date = i.date::date AND i3.status != 'On Hold'
      GROUP BY i3.status
      LIMIT 1
    ) sub_s ON true
    WHERE i.date::date >= v_start_date
      AND i.date::date < v_end_date
      AND i.status != 'On Hold'
    GROUP BY i.date::date
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  ELSIF p_period_type = 'monthly' THEN
    -- Calculate monthly aggregates for a year
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'monthly',
      v_target_year,
      m.month_num,
      NULL::integer,
      NULL::date,
      COALESCE(agg.total_amount, 0),
      COALESCE(agg.total_balance, 0),
      COALESCE(agg.total_open_balance, 0),
      COALESCE(agg.invoice_count, 0)::integer,
      COALESCE(agg.unique_customer_count, 0)::integer,
      COALESCE(agg.invoice_only_amount, 0),
      COALESCE(agg.invoice_only_count, 0)::integer,
      COALESCE(agg.credit_memo_amount, 0),
      COALESCE(agg.credit_memo_count, 0)::integer,
      COALESCE(agg.debit_memo_amount, 0),
      COALESCE(agg.debit_memo_count, 0)::integer,
      COALESCE(agg.type_amounts, '{}'),
      COALESCE(agg.status_breakdown, '{}'),
      now(),
      now()
    FROM generate_series(1, 12) AS m(month_num)
    LEFT JOIN (
      SELECT
        EXTRACT(MONTH FROM i.date::date)::integer AS inv_month,
        SUM(i.amount) AS total_amount,
        SUM(i.balance) AS total_balance,
        SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END) AS total_open_balance,
        COUNT(*) AS invoice_count,
        COUNT(DISTINCT i.customer) AS unique_customer_count,
        SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END) AS invoice_only_amount,
        COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END) AS invoice_only_count,
        SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END) AS credit_memo_amount,
        COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END) AS credit_memo_count,
        SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END) AS debit_memo_amount,
        COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END) AS debit_memo_count,
        jsonb_object_agg(
          t.inv_type,
          jsonb_build_object('count', t.type_count, 'amount', t.type_amount)
        ) AS type_amounts,
        jsonb_object_agg(
          s.inv_status,
          jsonb_build_object('count', s.status_count, 'amount', s.status_amount)
        ) AS status_breakdown
      FROM acumatica_invoices i
      LEFT JOIN LATERAL (
        SELECT i2.type AS inv_type, COUNT(*) AS type_count, SUM(i2.amount) AS type_amount
        FROM acumatica_invoices i2
        WHERE EXTRACT(YEAR FROM i2.date::date) = v_target_year
          AND EXTRACT(MONTH FROM i2.date::date) = EXTRACT(MONTH FROM i.date::date)
          AND i2.status != 'On Hold'
        GROUP BY i2.type
        LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT i3.status AS inv_status, COUNT(*) AS status_count, SUM(i3.amount) AS status_amount
        FROM acumatica_invoices i3
        WHERE EXTRACT(YEAR FROM i3.date::date) = v_target_year
          AND EXTRACT(MONTH FROM i3.date::date) = EXTRACT(MONTH FROM i.date::date)
          AND i3.status != 'On Hold'
        GROUP BY i3.status
        LIMIT 1
      ) s ON true
      WHERE EXTRACT(YEAR FROM i.date::date) = v_target_year
        AND i.status != 'On Hold'
      GROUP BY EXTRACT(MONTH FROM i.date::date)
    ) agg ON agg.inv_month = m.month_num
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  ELSIF p_period_type = 'yearly' THEN
    -- Calculate yearly aggregates
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'yearly',
      EXTRACT(YEAR FROM i.date::date)::integer,
      NULL::integer,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      '{}',
      '{}',
      now(),
      now()
    FROM acumatica_invoices i
    WHERE i.status != 'On Hold'
    GROUP BY EXTRACT(YEAR FROM i.date::date)
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'period_type', p_period_type,
    'year', v_target_year,
    'month', p_month,
    'rows_affected', v_rows_affected
  );

  RETURN v_result;
END;
$$;

/*
  # Create cached customer balances table for instant page load

  1. New Tables
    - `cached_customer_balances` - Pre-computed customer data with balance info
      - All fields needed for the Customers list page
      - Refreshed by cron every 5 minutes alongside existing customer stats
      - Sorted by balance desc for instant display

  2. New Functions
    - `refresh_cached_customer_balances()` - Rebuilds the cache from live data

  3. Security
    - RLS enabled, authenticated users can read
    - Only the refresh function (service role) can write

  4. Notes
    - This eliminates the expensive CTE+JOIN query on every page load
    - The initial 50 rows now come from a simple SELECT with LIMIT
*/

CREATE TABLE IF NOT EXISTS cached_customer_balances (
  customer_id text PRIMARY KEY,
  customer_name text NOT NULL DEFAULT '',
  email_address text DEFAULT '',
  is_active boolean DEFAULT true,
  responded_this_month boolean DEFAULT false,
  postpone_until timestamptz,
  postpone_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  red_threshold_days integer DEFAULT 30,
  color_status text,
  calculated_balance numeric DEFAULT 0,
  calculated_balance_excl_cm numeric DEFAULT 0,
  gross_balance numeric DEFAULT 0,
  credit_memo_balance numeric DEFAULT 0,
  open_invoice_count bigint DEFAULT 0,
  red_count bigint DEFAULT 0,
  yellow_count bigint DEFAULT 0,
  green_count bigint DEFAULT 0,
  max_days_overdue integer DEFAULT 0,
  exclude_from_payment_analytics boolean DEFAULT false,
  exclude_from_customer_analytics boolean DEFAULT false,
  is_test_customer boolean DEFAULT false,
  cached_at timestamptz DEFAULT now()
);

ALTER TABLE cached_customer_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached customer balances"
  ON cached_customer_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cached_cust_bal_balance_desc
  ON cached_customer_balances (is_test_customer, calculated_balance DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cached_cust_bal_name
  ON cached_customer_balances (is_test_customer, customer_name);

CREATE OR REPLACE FUNCTION refresh_cached_customer_balances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE cached_customer_balances;

  INSERT INTO cached_customer_balances (
    customer_id, customer_name, email_address, is_active, responded_this_month,
    postpone_until, postpone_reason, created_at, updated_at, red_threshold_days,
    color_status, calculated_balance, calculated_balance_excl_cm, gross_balance,
    credit_memo_balance, open_invoice_count, red_count, yellow_count, green_count,
    max_days_overdue, exclude_from_payment_analytics, exclude_from_customer_analytics,
    is_test_customer, cached_at
  )
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_bal,
      COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as cm_bal,
      COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as inv_count,
      COUNT(*) FILTER (WHERE i.color_status = 'red' AND i.type IN ('Invoice', 'Debit Memo')) as red_cnt,
      COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange') AND i.type IN ('Invoice', 'Debit Memo')) as yellow_cnt,
      COUNT(*) FILTER (WHERE i.color_status = 'green' AND i.type IN ('Invoice', 'Debit Memo')) as green_cnt,
      MAX(
        CASE WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
        THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
        ELSE 0
        END
      ) as max_overdue
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status IN ('Open', 'Balanced')
    GROUP BY i.customer
  )
  SELECT
    c.customer_id,
    c.customer_name,
    c.email_address,
    COALESCE(c.is_active, true),
    COALESCE(c.responded_this_month, false),
    c.postpone_until,
    c.postpone_reason,
    c.created_at,
    c.updated_at,
    c.days_from_invoice_threshold,
    c.customer_color_status,
    COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0),
    COALESCE(cb.gross_bal, 0),
    COALESCE(cb.gross_bal, 0),
    COALESCE(cb.cm_bal, 0),
    COALESCE(cb.inv_count, 0)::bigint,
    COALESCE(cb.red_cnt, 0)::bigint,
    COALESCE(cb.yellow_cnt, 0)::bigint,
    COALESCE(cb.green_cnt, 0)::bigint,
    COALESCE(cb.max_overdue, 0)::int,
    COALESCE(c.exclude_from_payment_analytics, false),
    COALESCE(c.exclude_from_customer_analytics, false),
    COALESCE(c.is_test_customer, false),
    now()
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer;
END;
$$;

-- Initial population
SELECT refresh_cached_customer_balances();

-- Update the existing cron job to also refresh customer balances
SELECT cron.unschedule('refresh-customer-stats');

SELECT cron.schedule(
  'refresh-customer-stats',
  '*/5 * * * *',
  $$SELECT refresh_cached_customer_stats(); SELECT refresh_cached_customer_balances();$$
);

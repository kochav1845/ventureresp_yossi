/*
  # Create Cached Customer Stats Table and Refresh Function

  Caches the customer summary statistics (total customers, customers with debt,
  total owed, average balance, open invoices, etc.) so the Customers page can
  display them instantly without recomputing from thousands of invoice rows.

  1. New Tables
    - `cached_customer_stats`
      - `id` (integer, primary key, always 1 - singleton row)
      - `total_customers` (integer) - total number of customers
      - `active_customers` (integer) - customers marked as active
      - `customers_with_debt` (integer) - customers with balance > 0
      - `total_balance` (numeric) - sum of all customer net balances
      - `avg_balance` (numeric) - average balance per customer with debt
      - `total_open_invoices` (integer) - total open invoice count across all customers
      - `customers_with_overdue` (integer) - customers with overdue invoices
      - `total_customers_excl_test` (integer) - non-test customer count
      - `active_customers_excl_test` (integer) - non-test active customers
      - `customers_with_debt_excl_test` (integer)
      - `total_balance_excl_test` (numeric)
      - `avg_balance_excl_test` (numeric)
      - `total_open_invoices_excl_test` (integer)
      - `customers_with_overdue_excl_test` (integer)
      - `calculated_at` (timestamptz) - when last refreshed
      - `updated_at` (timestamptz)

  2. New Functions
    - `refresh_cached_customer_stats()` - recomputes all stats from live data

  3. Security
    - RLS enabled
    - Authenticated users can read
*/

CREATE TABLE IF NOT EXISTS cached_customer_stats (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_customers integer DEFAULT 0,
  active_customers integer DEFAULT 0,
  customers_with_debt integer DEFAULT 0,
  total_balance numeric DEFAULT 0,
  avg_balance numeric DEFAULT 0,
  total_open_invoices integer DEFAULT 0,
  customers_with_overdue integer DEFAULT 0,
  total_customers_excl_test integer DEFAULT 0,
  active_customers_excl_test integer DEFAULT 0,
  customers_with_debt_excl_test integer DEFAULT 0,
  total_balance_excl_test numeric DEFAULT 0,
  avg_balance_excl_test numeric DEFAULT 0,
  total_open_invoices_excl_test integer DEFAULT 0,
  customers_with_overdue_excl_test integer DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cached_customer_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached customer stats"
  ON cached_customer_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed the singleton row
INSERT INTO cached_customer_stats (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Function to refresh stats
CREATE OR REPLACE FUNCTION refresh_cached_customer_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) AS net_balance,
      COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) AS inv_count,
      MAX(
        CASE WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
          THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
          ELSE 0
        END
      ) AS max_overdue
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status IN ('Open', 'Balanced')
    GROUP BY i.customer
  ),
  all_stats AS (
    SELECT
      c.is_test_customer,
      COUNT(*)::integer AS total_customers,
      COUNT(*) FILTER (WHERE c.is_active)::integer AS active_customers,
      COUNT(*) FILTER (WHERE COALESCE(cb.net_balance, 0) > 0)::integer AS with_debt,
      COALESCE(SUM(GREATEST(cb.net_balance, 0)), 0) AS total_bal,
      COALESCE(SUM(cb.inv_count), 0)::integer AS total_inv,
      COUNT(*) FILTER (WHERE COALESCE(cb.max_overdue, 0) > 0)::integer AS with_overdue
    FROM acumatica_customers c
    LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
    GROUP BY c.is_test_customer
  ),
  combined AS (
    SELECT
      COALESCE(SUM(total_customers), 0)::integer AS total_customers,
      COALESCE(SUM(active_customers), 0)::integer AS active_customers,
      COALESCE(SUM(with_debt), 0)::integer AS customers_with_debt,
      COALESCE(SUM(total_bal), 0) AS total_balance,
      COALESCE(SUM(total_inv), 0)::integer AS total_open_invoices,
      COALESCE(SUM(with_overdue), 0)::integer AS customers_with_overdue,
      COALESCE((SELECT total_customers FROM all_stats WHERE is_test_customer = false), 0)::integer AS total_excl_test,
      COALESCE((SELECT active_customers FROM all_stats WHERE is_test_customer = false), 0)::integer AS active_excl_test,
      COALESCE((SELECT with_debt FROM all_stats WHERE is_test_customer = false), 0)::integer AS debt_excl_test,
      COALESCE((SELECT total_bal FROM all_stats WHERE is_test_customer = false), 0) AS bal_excl_test,
      COALESCE((SELECT total_inv FROM all_stats WHERE is_test_customer = false), 0)::integer AS inv_excl_test,
      COALESCE((SELECT with_overdue FROM all_stats WHERE is_test_customer = false), 0)::integer AS overdue_excl_test
    FROM all_stats
  )
  UPDATE cached_customer_stats SET
    total_customers = c.total_customers,
    active_customers = c.active_customers,
    customers_with_debt = c.customers_with_debt,
    total_balance = c.total_balance,
    avg_balance = CASE WHEN c.customers_with_debt > 0 THEN c.total_balance / c.customers_with_debt ELSE 0 END,
    total_open_invoices = c.total_open_invoices,
    customers_with_overdue = c.customers_with_overdue,
    total_customers_excl_test = c.total_excl_test,
    active_customers_excl_test = c.active_excl_test,
    customers_with_debt_excl_test = c.debt_excl_test,
    total_balance_excl_test = c.bal_excl_test,
    avg_balance_excl_test = CASE WHEN c.debt_excl_test > 0 THEN c.bal_excl_test / c.debt_excl_test ELSE 0 END,
    total_open_invoices_excl_test = c.inv_excl_test,
    customers_with_overdue_excl_test = c.overdue_excl_test,
    calculated_at = now(),
    updated_at = now()
  FROM combined c
  WHERE cached_customer_stats.id = 1;

  SELECT jsonb_build_object(
    'success', true,
    'calculated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Seed initial data
SELECT refresh_cached_customer_stats();

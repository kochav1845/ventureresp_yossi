/*
  # Create customer dashboard stats function

  1. New Function
    - `get_customer_dashboard_stats(p_exclude_credit_memos boolean, p_test_customers boolean)`
      - Computes accurate totals directly from the database in a single query
      - Returns: total_customers, customers_with_debt, total_balance, avg_balance,
                 total_open_invoices, customers_with_overdue

  2. Why
    - The frontend was summing balances from a paginated/partial customer list
    - This led to inaccurate totals (showing ~$23M instead of the real ~$6M)
    - A server-side calculation across all data is always accurate
*/

CREATE OR REPLACE FUNCTION get_customer_dashboard_stats(
  p_exclude_credit_memos boolean DEFAULT false,
  p_test_customers boolean DEFAULT false
)
RETURNS TABLE (
  total_customers bigint,
  customers_with_debt bigint,
  total_balance numeric,
  avg_balance numeric,
  total_open_invoices bigint,
  customers_with_overdue bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH customer_balances AS (
    SELECT
      i.customer,
      SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END) as gross_balance,
      SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END) as credit_balance,
      COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count,
      MAX(
        CASE
          WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type = 'Invoice'
          THEN GREATEST(0, (CURRENT_DATE - i.date::date))
          ELSE 0
        END
      ) as max_overdue_days
    FROM acumatica_invoices i
    WHERE i.balance > 0 AND i.status = 'Open'
    GROUP BY i.customer
  ),
  per_customer AS (
    SELECT
      c.customer_id,
      CASE 
        WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance, 0)
        ELSE COALESCE(cb.gross_balance - cb.credit_balance, 0)
      END as net_bal,
      COALESCE(cb.invoice_count, 0) as inv_count,
      COALESCE(cb.max_overdue_days, 0) as overdue_days
    FROM acumatica_customers c
    LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
    WHERE c.is_test_customer = p_test_customers
  )
  SELECT
    COUNT(*)::bigint as total_customers,
    COUNT(*) FILTER (WHERE net_bal > 0)::bigint as customers_with_debt,
    COALESCE(SUM(net_bal) FILTER (WHERE net_bal > 0), 0)::numeric as total_balance,
    CASE 
      WHEN COUNT(*) FILTER (WHERE net_bal > 0) > 0 
      THEN (SUM(net_bal) FILTER (WHERE net_bal > 0) / COUNT(*) FILTER (WHERE net_bal > 0))::numeric
      ELSE 0 
    END as avg_balance,
    COALESCE(SUM(inv_count), 0)::bigint as total_open_invoices,
    COUNT(*) FILTER (WHERE overdue_days > 0)::bigint as customers_with_overdue
  FROM per_customer;
$$;

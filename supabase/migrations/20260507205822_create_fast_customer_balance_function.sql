/*
  # Create fast customer balance function for initial page load

  1. Purpose
    - The existing `get_customers_with_balance` function takes ~5.6s per 1000 rows
      due to complex conditional filtering logic (date ranges, days overdue, etc.)
    - This new function returns ALL customers with basic balance data in ~660ms
    - Used for the initial unfiltered page load; the heavy function is only
      called when filters are actually applied

  2. New Function
    - `get_customers_with_balance_fast(p_test_customers, p_exclude_credit_memos)`
    - Returns: customer_id, customer_name, email, balances, invoice counts,
      color status counts, max days overdue, exclusion flags, red threshold
    - No date filtering, no avg_days_to_collect, no invoice amount filtering
    - Simple aggregation over invoices with balance > 0 and status IN (Open, Balanced)

  3. Performance
    - ~660ms for all 2,677 customers (vs ~17s with the old approach)
    - Single query, no batching needed
*/

CREATE OR REPLACE FUNCTION public.get_customers_with_balance_fast(
  p_test_customers boolean DEFAULT false,
  p_exclude_credit_memos boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  customer_id text,
  customer_name text,
  customer_status text,
  email_address text,
  city text,
  state text,
  country text,
  customer_class text,
  terms text,
  credit_limit numeric,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz,
  red_threshold_days integer,
  color_status text,
  calculated_balance numeric,
  gross_balance numeric,
  credit_memo_balance numeric,
  open_invoice_count bigint,
  red_count bigint,
  yellow_count bigint,
  green_count bigint,
  max_days_overdue integer,
  exclude_from_payment_analytics boolean,
  exclude_from_customer_analytics boolean,
  filtered_gross_balance numeric,
  filtered_invoice_count bigint,
  filtered_net_balance numeric
)
LANGUAGE sql
STABLE
AS $function$
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
    c.id,
    c.customer_id,
    c.customer_name,
    c.customer_status,
    c.email_address,
    c.city,
    c.billing_state as state,
    c.country,
    c.customer_class,
    c.terms,
    c.credit_limit,
    c.created_at,
    c.updated_at,
    c.synced_at,
    c.days_from_invoice_threshold as red_threshold_days,
    c.customer_color_status as color_status,
    CASE
      WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_bal, 0)
      ELSE COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0)
    END as calculated_balance,
    COALESCE(cb.gross_bal, 0) as gross_balance,
    COALESCE(cb.cm_bal, 0) as credit_memo_balance,
    COALESCE(cb.inv_count, 0)::bigint as open_invoice_count,
    COALESCE(cb.red_cnt, 0)::bigint as red_count,
    COALESCE(cb.yellow_cnt, 0)::bigint as yellow_count,
    COALESCE(cb.green_cnt, 0)::bigint as green_count,
    COALESCE(cb.max_overdue, 0)::int as max_days_overdue,
    COALESCE(c.exclude_from_payment_analytics, false) as exclude_from_payment_analytics,
    COALESCE(c.exclude_from_customer_analytics, false) as exclude_from_customer_analytics,
    COALESCE(cb.gross_bal, 0) as filtered_gross_balance,
    COALESCE(cb.inv_count, 0)::bigint as filtered_invoice_count,
    (COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0)) as filtered_net_balance
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE c.is_test_customer = p_test_customers
  ORDER BY c.customer_name ASC;
$function$;

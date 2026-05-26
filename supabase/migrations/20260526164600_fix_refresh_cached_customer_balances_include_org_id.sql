/*
  # Fix refresh_cached_customer_balances to include organization_id

  The cached table now has RLS filtering by organization_id, so the refresh
  function must populate that column from acumatica_customers.
*/

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
    is_test_customer, cached_at, organization_id
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
    now(),
    c.organization_id
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer;
END;
$$;

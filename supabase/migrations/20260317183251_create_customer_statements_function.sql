/*
  # Create customer statements aggregation function

  1. New Functions
    - `get_customer_statements(p_test_mode boolean)` - Returns pre-aggregated customer statement data
      - Aggregates total balance, credit memo balance, open invoice count, max days overdue
      - Filters by test/non-test customers
      - Only returns customers with open balances (unless test mode)
      - Performs all computation server-side in a single query

  2. Performance
    - Replaces 50+ sequential API calls with a single database function call
    - All aggregation done server-side using SQL window functions
*/

CREATE OR REPLACE FUNCTION get_customer_statements(p_test_mode boolean DEFAULT false)
RETURNS TABLE (
  customer_id text,
  customer_name text,
  email text,
  terms text,
  total_balance numeric,
  credit_memo_balance numeric,
  open_invoice_count bigint,
  max_days_overdue integer
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.customer_id,
    c.customer_name,
    COALESCE(c.billing_email, c.general_email, '') AS email,
    COALESCE(c.terms, '') AS terms,
    COALESCE(SUM(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') AND i.balance > 0 AND i.status != 'Voided'
        THEN i.balance ELSE 0 END
    ), 0) AS total_balance,
    COALESCE(SUM(
      CASE WHEN i.type IN ('Credit Memo', 'Credit WO') AND i.balance > 0
        THEN i.balance ELSE 0 END
    ), 0) AS credit_memo_balance,
    COUNT(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') AND i.balance > 0 AND i.status != 'Voided'
        THEN 1 END
    ) AS open_invoice_count,
    COALESCE(MAX(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') AND i.balance > 0 AND i.status != 'Voided'
        THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date::date, CURRENT_DATE)))
        ELSE 0 END
    ), 0) AS max_days_overdue
  FROM acumatica_customers c
  LEFT JOIN acumatica_invoices i ON i.customer = c.customer_id
    AND i.balance > 0
    AND i.status != 'Voided'
  WHERE c.is_test_customer = p_test_mode
  GROUP BY c.customer_id, c.customer_name, c.billing_email, c.general_email, c.terms
  HAVING
    CASE WHEN p_test_mode THEN true
    ELSE COALESCE(SUM(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') AND i.balance > 0 AND i.status != 'Voided'
        THEN i.balance ELSE 0 END
    ), 0) > 0
    END;
END;
$$;

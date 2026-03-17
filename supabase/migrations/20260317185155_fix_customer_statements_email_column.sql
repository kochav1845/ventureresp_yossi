/*
  # Fix customer statements email column

  1. Changes
    - Updated `get_customer_statements` function to use `email_address` column instead of only
      `billing_email` and `general_email` (which are nearly empty)
    - The `email_address` column has data for ~2266 of 2635 customers
    - Priority order: email_address, billing_email, general_email

  2. Impact
    - Customers will now correctly show their email addresses on the Statements page
*/

DROP FUNCTION IF EXISTS get_customer_statements(boolean);

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
) LANGUAGE sql STABLE AS $$
  SELECT
    c.customer_id,
    c.customer_name,
    COALESCE(NULLIF(c.email_address, ''), NULLIF(c.billing_email, ''), NULLIF(c.general_email, ''), '')::text AS email,
    COALESCE(c.terms, '')::text AS terms,
    COALESCE(SUM(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO')
        THEN i.balance ELSE 0 END
    ), 0) AS total_balance,
    COALESCE(SUM(
      CASE WHEN i.type IN ('Credit Memo', 'Credit WO')
        THEN i.balance ELSE 0 END
    ), 0) AS credit_memo_balance,
    COUNT(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO')
        THEN 1 END
    ) AS open_invoice_count,
    COALESCE(MAX(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO')
        THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date::date, CURRENT_DATE)))
        ELSE 0 END
    ), 0)::integer AS max_days_overdue
  FROM acumatica_customers c
  LEFT JOIN acumatica_invoices i ON i.customer = c.customer_id
    AND i.balance > 0
    AND i.status != 'Voided'
  WHERE c.is_test_customer = p_test_mode
  GROUP BY c.customer_id, c.customer_name, c.email_address, c.billing_email, c.general_email, c.terms
  HAVING
    CASE WHEN p_test_mode THEN true
    ELSE COALESCE(SUM(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO')
        THEN i.balance ELSE 0 END
    ), 0) > 0
    END;
$$;

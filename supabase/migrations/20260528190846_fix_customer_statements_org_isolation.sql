/*
  # Fix get_customer_statements org isolation

  1. Changes
    - Added organization_id filter using get_user_org_id()
    - Ensures demo mode shows demo org customers, not real org customers
    - Changed from SQL to plpgsql to call get_user_org_id() once upfront

  2. Security
    - Users can only see customers from their current org context
    - Respects x-org-id header for super admins and demo mode
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
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := get_user_org_id();

  RETURN QUERY
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
    AND i.status NOT IN ('Voided', 'On Hold')
    AND i.organization_id = v_org_id
  WHERE c.organization_id = v_org_id
    AND c.is_test_customer = p_test_mode
  GROUP BY c.customer_id, c.customer_name, c.email_address, c.billing_email, c.general_email, c.terms
  HAVING
    CASE WHEN p_test_mode THEN true
    ELSE COALESCE(SUM(
      CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO')
        THEN i.balance ELSE 0 END
    ), 0) > 0
    END;
END;
$$;

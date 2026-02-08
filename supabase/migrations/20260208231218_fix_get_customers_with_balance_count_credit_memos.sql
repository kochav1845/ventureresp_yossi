/*
  # Fix get_customers_with_balance_count - Add Credit Memo Support

  1. Changes
    - Add p_exclude_credit_memos parameter to count function
    - Update balance calculations to handle credit memos properly
    - Ensure count function matches the main function's logic

  2. Notes
    - This ensures the count matches the filtered customer list
    - Credit memos should be handled consistently between count and main function
*/

DROP FUNCTION IF EXISTS get_customers_with_balance_count(text,text,text,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,text);
DROP FUNCTION IF EXISTS get_customers_with_balance_count(text,text,text,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text);

CREATE OR REPLACE FUNCTION get_customers_with_balance_count(
  p_search TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT NULL,
  p_country_filter TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_balance_filter TEXT DEFAULT 'all',
  p_min_balance NUMERIC DEFAULT NULL,
  p_max_balance NUMERIC DEFAULT NULL,
  p_min_open_invoices INT DEFAULT NULL,
  p_max_open_invoices INT DEFAULT NULL,
  p_min_invoice_amount NUMERIC DEFAULT NULL,
  p_max_invoice_amount NUMERIC DEFAULT NULL,
  p_exclude_credit_memos BOOLEAN DEFAULT FALSE,
  p_date_context TEXT DEFAULT 'invoice_date'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result BIGINT;
BEGIN
  WITH customer_balances AS (
    SELECT
      i.customer,
      -- Gross balance: only regular invoices
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
      -- Credit memo balance: credit memos and credit write-offs
      COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
      -- Net balance: invoices minus credit memos
      COALESCE(
        SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END) -
        SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
        0
      ) as net_balance_amt,
      -- Invoice count: only count regular invoices
      COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  ),
  date_filtered_customers AS (
    -- Filter by invoice dates
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE (p_date_context IS NULL OR p_date_context = 'invoice_date')
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    
    UNION
    
    -- Filter by customer added date (synced_at)
    SELECT c.customer_id
    FROM acumatica_customers c
    WHERE p_date_context = 'customer_added'
      AND (p_date_from IS NULL OR c.synced_at >= p_date_from)
      AND (p_date_to IS NULL OR c.synced_at <= p_date_to)
    
    UNION
    
    -- Filter by balance date (invoices with balance changes in date range)
    SELECT DISTINCT i.customer
    FROM acumatica_invoices i
    WHERE p_date_context = 'balance_date'
      AND i.balance > 0
      AND (p_date_from IS NULL OR i.date >= p_date_from::date)
      AND (p_date_to IS NULL OR i.date <= p_date_to::date)
  )
  SELECT COUNT(*)
  INTO result
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE
    (p_search IS NULL OR p_search = '' OR
     c.customer_id ILIKE '%' || p_search || '%' OR
     c.customer_name ILIKE '%' || p_search || '%' OR
     c.email_address ILIKE '%' || p_search || '%' OR
     c.customer_class ILIKE '%' || p_search || '%' OR
     c.city ILIKE '%' || p_search || '%' OR
     c.country ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
    AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
    AND (
      (p_date_from IS NULL AND p_date_to IS NULL)
      OR c.customer_id IN (SELECT customer FROM date_filtered_customers)
    )
    AND (
      p_balance_filter = 'all' OR
      (p_balance_filter = 'positive' AND 
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR
      (p_balance_filter = 'negative' AND 
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR
      (p_balance_filter = 'zero' AND 
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0)
    )
    AND (p_min_balance IS NULL OR 
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
    AND (p_max_balance IS NULL OR 
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
    AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
    AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
    AND (
      (p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL)
      OR cb.invoice_count > 0
    );

  RETURN result;
END;
$$;

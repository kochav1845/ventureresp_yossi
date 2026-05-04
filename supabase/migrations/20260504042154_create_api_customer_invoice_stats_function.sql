/*
  # Create API customer invoice stats function

  1. New Functions
    - `get_api_customer_invoice_stats` - Aggregates invoice data by status and type for a single customer
      - Groups by status and type
      - Returns count, total_amount, total_balance per group
      - Avoids the 1000-row default limit from Supabase client queries
      - Used by the GPT data API customer detail endpoint

  2. Purpose
    - Replaces fetching all invoice rows and aggregating in JS
    - Handles customers with 1000+ invoices correctly
    - Much faster than transferring all rows over the network
*/

CREATE OR REPLACE FUNCTION get_api_customer_invoice_stats(p_customer_id text)
RETURNS TABLE (
  status text,
  type text,
  cnt bigint,
  total_amount numeric,
  total_balance numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.status,
    i.type,
    COUNT(*) AS cnt,
    ROUND(SUM(i.amount), 2) AS total_amount,
    ROUND(SUM(i.balance), 2) AS total_balance
  FROM acumatica_invoices i
  WHERE i.customer = p_customer_id
  GROUP BY i.status, i.type
  ORDER BY i.status, i.type;
$$;

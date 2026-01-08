/*
  # Create Unpaid Invoice Statistics Function

  ## Summary
  Creates a database function to efficiently calculate unpaid invoice statistics
  without hitting Supabase's row limit.

  ## Changes
  - Create `get_unpaid_invoice_stats` function that returns:
    - count: Total number of unpaid invoices
    - total_balance: Sum of all unpaid balances

  ## Purpose
  Avoids the 1,000 row limit when fetching unpaid invoices by using server-side aggregation.
*/

-- Create function to get unpaid invoice statistics
CREATE OR REPLACE FUNCTION get_unpaid_invoice_stats()
RETURNS TABLE (
  count bigint,
  total_balance numeric
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(*)::bigint as count,
    COALESCE(SUM(balance), 0)::numeric as total_balance
  FROM acumatica_invoices
  WHERE balance > 0;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_unpaid_invoice_stats() TO authenticated;

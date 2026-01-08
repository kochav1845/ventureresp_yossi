/*
  # Create Payment Application Statistics Function

  ## Summary
  Creates a database function to efficiently calculate payment application statistics
  without hitting Supabase's row limit.

  ## Changes
  - Create `get_payment_application_stats` function that returns:
    - total_payments: Count of unique payments
    - total_applications: Total number of invoice applications
    - unique_customers: Count of unique customers
    - total_applied: Sum of all amounts paid

  ## Purpose
  Avoids the 1,000 row limit when fetching payment applications by using server-side aggregation.
*/

-- Create function to get payment application statistics
CREATE OR REPLACE FUNCTION get_payment_application_stats()
RETURNS TABLE (
  total_payments bigint,
  total_applications bigint,
  unique_customers bigint,
  total_applied numeric
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(DISTINCT payment_id)::bigint as total_payments,
    COUNT(*)::bigint as total_applications,
    COUNT(DISTINCT customer_id)::bigint as unique_customers,
    COALESCE(SUM(amount_paid), 0)::numeric as total_applied
  FROM payment_invoice_applications;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_payment_application_stats() TO authenticated;

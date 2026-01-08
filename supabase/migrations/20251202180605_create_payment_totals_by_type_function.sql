/*
  # Create Payment Totals Function

  1. New Function
    - `get_payment_totals_by_type()` - Returns total payments and credit memos
      - Returns JSON with payment and credit memo totals
      - Aggregates directly in the database for performance
  
  2. Security
    - Function is SECURITY DEFINER to allow access
    - Restricted to authenticated users
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_payment_totals_by_type();

-- Create function to get payment totals by type
CREATE OR REPLACE FUNCTION get_payment_totals_by_type()
RETURNS TABLE(
  type text,
  total numeric,
  count bigint
) 
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    type,
    SUM(payment_amount::numeric) as total,
    COUNT(*) as count
  FROM acumatica_payments
  WHERE payment_amount IS NOT NULL
  GROUP BY type;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_payment_totals_by_type() TO authenticated;
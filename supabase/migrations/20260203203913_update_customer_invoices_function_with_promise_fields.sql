/*
  # Add Promise Fields to Customer Invoices Function

  ## Summary
  Updates the get_collector_customer_invoices function to include promise_date
  and promise_by_user_id so collectors can see broken promises on customer invoices.

  ## Changes
  1. Drop existing get_collector_customer_invoices function
  2. Recreate with promise fields

  ## Notes
  - Enables "Broken Promise" tracking for customer-level assignments
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_collector_customer_invoices(text, uuid);

-- Recreate the function with promise fields included
CREATE OR REPLACE FUNCTION get_collector_customer_invoices(p_customer_id text, p_collector_id uuid)
RETURNS TABLE (
  invoice_reference_number text,
  customer text,
  customer_name text,
  date timestamptz,
  due_date timestamptz,
  amount numeric,
  balance numeric,
  invoice_balance numeric,
  status text,
  invoice_status text,
  color_status text,
  promise_date timestamptz,
  promise_by_user_id uuid,
  description text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    inv.reference_number,
    inv.customer,
    inv.customer_name,
    inv.date,
    inv.due_date,
    inv.amount,
    inv.balance,
    inv.balance as invoice_balance,
    inv.status,
    inv.status as invoice_status,
    inv.color_status,
    inv.promise_date,
    inv.promise_by_user_id,
    inv.description
  FROM acumatica_invoices inv
  WHERE inv.customer = p_customer_id
    AND inv.balance > 0
    AND EXISTS (
      SELECT 1 FROM collector_customer_assignments cca
      WHERE cca.customer_id = p_customer_id
      AND cca.assigned_collector_id = p_collector_id
    )
  ORDER BY inv.due_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_collector_customer_invoices TO authenticated;

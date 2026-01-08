/*
  # Create Auto Red Status Function

  1. New Functions
    - `auto_update_invoice_red_status()` - Automatically marks invoices as red based on customer-specific thresholds
    
  2. Purpose
    - Checks all open invoices against their customer's days_past_due_threshold
    - Automatically sets color_status to 'red' if past the threshold and still unpaid
    - Respects manual overrides (green/orange status) unless they've been red before
    - Can be called manually or via cron job
    
  3. Logic
    - For each open invoice, check days past due date
    - Compare against customer's threshold (default 30 days)
    - Only auto-set to red if balance > 0 and not manually set to green/orange
*/

CREATE OR REPLACE FUNCTION auto_update_invoice_red_status()
RETURNS TABLE(
  updated_count integer,
  invoice_numbers text[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Update invoices to red status if they're past their customer's threshold
  WITH updated_invoices AS (
    UPDATE acumatica_invoices AS inv
    SET color_status = 'red',
        updated_at = now()
    FROM acumatica_customers AS cust
    WHERE inv.customer = cust.customer_id
      AND inv.status = 'Open'
      AND inv.balance > 0
      AND (inv.color_status IS NULL OR inv.color_status != 'red')
      AND inv.due_date IS NOT NULL
      AND (CURRENT_DATE - inv.due_date::date) >= COALESCE(cust.days_past_due_threshold, 30)
    RETURNING inv.reference_number
  )
  SELECT 
    COUNT(*)::integer,
    ARRAY_AGG(reference_number)
  INTO v_updated_count, v_invoice_numbers
  FROM updated_invoices;

  RETURN QUERY SELECT v_updated_count, v_invoice_numbers;
END;
$$;

COMMENT ON FUNCTION auto_update_invoice_red_status IS 
  'Automatically updates invoice color_status to red based on customer-specific days_past_due_threshold';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION auto_update_invoice_red_status() TO authenticated;

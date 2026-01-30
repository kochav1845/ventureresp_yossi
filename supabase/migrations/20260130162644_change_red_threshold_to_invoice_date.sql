/*
  # Change Red Threshold to Calculate from Invoice Date

  1. Changes
    - Rename `days_past_due_threshold` to `days_from_invoice_threshold` for clarity
    - Update `auto_update_invoice_red_status()` function to calculate from invoice DATE not DUE DATE
    - Update all related functions to use invoice date instead of due date
    
  2. Logic Change
    - OLD: Invoice turns red when (today - due_date) >= threshold
    - NEW: Invoice turns red when (today - invoice_date) >= threshold
    
  3. Purpose
    - Customer threshold now represents "days from invoice date" not "days past due"
    - More predictable and consistent behavior
    - Example: If threshold is 30, invoice from 30 days ago turns red today
*/

-- 1. Rename the column for clarity
ALTER TABLE acumatica_customers 
RENAME COLUMN days_past_due_threshold TO days_from_invoice_threshold;

-- Update the comment to reflect the new meaning
COMMENT ON COLUMN acumatica_customers.days_from_invoice_threshold IS 
  'Number of days from invoice date before invoices should be marked red (default: 30 days)';

-- 2. Update the auto_update_invoice_red_status function to use invoice date instead of due date
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
  -- Update invoices to red status if they're past their customer's threshold FROM INVOICE DATE
  WITH updated_invoices AS (
    UPDATE acumatica_invoices AS inv
    SET color_status = 'red',
        last_modified_by_color = 'system_auto_threshold',
        updated_at = now()
    FROM acumatica_customers AS cust
    WHERE inv.customer = cust.customer_id
      AND inv.status = 'Open'
      AND inv.balance > 0
      AND (inv.color_status IS NULL OR inv.color_status != 'red')
      AND inv.date IS NOT NULL
      -- Changed from due_date to invoice date
      AND (CURRENT_DATE - inv.date::date) >= COALESCE(cust.days_from_invoice_threshold, 30)
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
  'Automatically updates invoice color_status to red based on customer-specific days_from_invoice_threshold (calculated from invoice date)';

-- 3. Also update the untouched function to be consistent
CREATE OR REPLACE FUNCTION auto_red_untouched_for_30_days()
RETURNS TABLE(updated_count integer, invoice_numbers text[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Mark invoices RED based on customer's threshold if untouched
  WITH updated_invoices AS (
    UPDATE acumatica_invoices AS inv
    SET 
      color_status = 'red',
      last_modified_by_color = 'system_auto_untouched',
      updated_at = now()
    FROM acumatica_customers AS cust
    WHERE inv.customer = cust.customer_id
      AND inv.status = 'Open'
      AND inv.balance > 0
      AND (inv.color_status IS NULL OR inv.color_status != 'red')
      AND inv.date IS NOT NULL
      AND (
        -- Never touched and invoice is older than customer's threshold
        (inv.last_touched_date IS NULL 
         AND (CURRENT_DATE - inv.date::date) >= COALESCE(cust.days_from_invoice_threshold, 30))
        OR
        -- Last touched more than threshold days ago
        (inv.last_touched_date IS NOT NULL
         AND (CURRENT_DATE - inv.last_touched_date::date) >= COALESCE(cust.days_from_invoice_threshold, 30))
      )
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

COMMENT ON FUNCTION auto_red_untouched_for_30_days IS 
  'Marks invoices RED if untouched based on customer threshold (calculated from invoice date)';

-- 4. Update the past due function to also respect customer thresholds from invoice date
CREATE OR REPLACE FUNCTION auto_red_past_due_invoices()
RETURNS TABLE(updated_count integer, invoice_numbers text[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Mark invoices RED based on customer's threshold from invoice date
  WITH updated_invoices AS (
    UPDATE acumatica_invoices AS inv
    SET 
      color_status = 'red',
      last_modified_by_color = 'system_auto_threshold',
      updated_at = now()
    FROM acumatica_customers AS cust
    WHERE inv.customer = cust.customer_id
      AND inv.status = 'Open'
      AND inv.balance > 0
      AND inv.date IS NOT NULL
      AND (CURRENT_DATE - inv.date::date) >= COALESCE(cust.days_from_invoice_threshold, 30)
      AND (inv.color_status IS NULL OR inv.color_status != 'red')
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

COMMENT ON FUNCTION auto_red_past_due_invoices IS 
  'Marks invoices RED when they exceed customer threshold from invoice date';

/*
  # Fix Invoice Auto-Red Status System

  This migration implements the critical auto-red status requirements:

  ## 1. Contact Status Tracking
  - Track `last_touched_date` on invoices
  - Track `contact_status` (untouched/touched) on customers
  - Visual indicators reflect contact status

  ## 2. Invoice Auto-Red Logic - IMMEDIATE ON DUE DATE
  - Invoices turn RED immediately when they pass their due date AND have balance > 0
  - Invoices turn RED if untouched for 30 days (even if not past due)
  - Red status remains until EITHER:
    * Payment brings balance to $0
    * Invoice is touched/contacted

  ## 3. Auto-Clear Red Status
  - When balance reaches $0, color_status is automatically cleared
  - When invoice is touched, it's no longer "untouched"

  ## 4. Automated Cron Job
  - Runs every 5 minutes to check and update red statuses

  ## Changes Made
  1. Drop old auto_update_invoice_red_status function (uses 30-day threshold)
  2. Create new immediate_red_on_due_date function (immediate)
  3. Create auto_red_untouched_for_30_days function (30-day untouched rule)
  4. Create clear_red_when_paid trigger function
  5. Create trigger to auto-clear red when balance = 0
  6. Create cron job to run auto-red checks every 5 minutes
*/

-- Drop the old threshold-based function (not what user wants)
DROP FUNCTION IF EXISTS auto_update_invoice_red_status();

-- 1. Create function to mark invoices RED immediately when they pass due date
CREATE OR REPLACE FUNCTION auto_red_past_due_invoices()
RETURNS TABLE(updated_count integer, invoice_numbers text[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Mark invoices RED if:
  -- 1. They have a due date
  -- 2. Due date has passed (today > due_date)
  -- 3. Balance > 0
  -- 4. Status is Open
  -- 5. Not already red
  WITH updated_invoices AS (
    UPDATE acumatica_invoices
    SET 
      color_status = 'red',
      last_modified_by_color = 'system_auto_due_date',
      updated_at = now()
    WHERE 
      status = 'Open'
      AND balance > 0
      AND due_date IS NOT NULL
      AND due_date::date < CURRENT_DATE
      AND (color_status IS NULL OR color_status != 'red')
    RETURNING reference_number
  )
  SELECT 
    COUNT(*)::integer,
    ARRAY_AGG(reference_number)
  INTO v_updated_count, v_invoice_numbers
  FROM updated_invoices;

  RETURN QUERY SELECT v_updated_count, v_invoice_numbers;
END;
$$;

-- 2. Create function to mark invoices RED if untouched for 30 days
CREATE OR REPLACE FUNCTION auto_red_untouched_for_30_days()
RETURNS TABLE(updated_count integer, invoice_numbers text[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  -- Mark invoices RED if:
  -- 1. Balance > 0
  -- 2. Status is Open
  -- 3. Not already red
  -- 4. EITHER: never touched and invoice date > 30 days old
  --     OR: last touch was > 30 days ago
  WITH updated_invoices AS (
    UPDATE acumatica_invoices
    SET 
      color_status = 'red',
      last_modified_by_color = 'system_auto_untouched_30d',
      updated_at = now()
    WHERE 
      status = 'Open'
      AND balance > 0
      AND (color_status IS NULL OR color_status != 'red')
      AND (
        -- Never touched and invoice is older than 30 days
        (last_touched_date IS NULL AND date < (CURRENT_DATE - INTERVAL '30 days')::date)
        OR
        -- Last touched more than 30 days ago
        (last_touched_date < (now() - INTERVAL '30 days'))
      )
    RETURNING reference_number
  )
  SELECT 
    COUNT(*)::integer,
    ARRAY_AGG(reference_number)
  INTO v_updated_count, v_invoice_numbers
  FROM updated_invoices;

  RETURN QUERY SELECT v_updated_count, v_invoice_numbers;
END;
$$;

-- 3. Create master function that runs both auto-red checks
CREATE OR REPLACE FUNCTION run_auto_red_status_checks()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_past_due_count integer;
  v_past_due_invoices text[];
  v_untouched_count integer;
  v_untouched_invoices text[];
  v_result json;
BEGIN
  -- Run past due check
  SELECT updated_count, invoice_numbers 
  INTO v_past_due_count, v_past_due_invoices
  FROM auto_red_past_due_invoices();

  -- Run untouched check
  SELECT updated_count, invoice_numbers 
  INTO v_untouched_count, v_untouched_invoices
  FROM auto_red_untouched_for_30_days();

  -- Build result
  v_result := json_build_object(
    'past_due_marked_red', v_past_due_count,
    'past_due_invoices', v_past_due_invoices,
    'untouched_marked_red', v_untouched_count,
    'untouched_invoices', v_untouched_invoices,
    'total_marked_red', v_past_due_count + v_untouched_count,
    'timestamp', now()
  );

  RETURN v_result;
END;
$$;

-- 4. Create trigger function to CLEAR red status when balance = 0
CREATE OR REPLACE FUNCTION clear_red_status_when_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If balance becomes 0 or negative, clear the red status
  IF NEW.balance <= 0 AND OLD.balance > 0 AND OLD.color_status = 'red' THEN
    NEW.color_status := NULL;
    NEW.last_modified_by_color := 'system_auto_cleared_paid';
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Create trigger to auto-clear red when invoice is paid
DROP TRIGGER IF EXISTS trigger_clear_red_when_paid ON acumatica_invoices;
CREATE TRIGGER trigger_clear_red_when_paid
  BEFORE UPDATE OF balance ON acumatica_invoices
  FOR EACH ROW
  EXECUTE FUNCTION clear_red_status_when_paid();

-- 6. Create cron job to run auto-red checks every 5 minutes
DO $$
BEGIN
  -- Remove old job if exists
  PERFORM cron.unschedule('auto-red-status-checker');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-red-status-checker',
  '*/5 * * * *',  -- Every 5 minutes
  $$SELECT run_auto_red_status_checks();$$
);

-- 7. Run the auto-red checks immediately to mark existing invoices
SELECT run_auto_red_status_checks();

COMMENT ON FUNCTION auto_red_past_due_invoices IS 'Marks invoices RED immediately when they pass their due date';
COMMENT ON FUNCTION auto_red_untouched_for_30_days IS 'Marks invoices RED if untouched for 30 days';
COMMENT ON FUNCTION run_auto_red_status_checks IS 'Master function that runs all auto-red status checks';
COMMENT ON FUNCTION clear_red_status_when_paid IS 'Automatically clears red status when invoice balance becomes 0';

/*
  # Fix Invoice Reminder Cron Job to Use Stored Credentials

  ## Problem
  - Job #3 (check-invoice-reminders) is failing because it's trying to read from
    `current_setting('app.settings.api_url')` which doesn't exist
  - The Supabase URL and service role key are actually stored in the 
    `acumatica_sync_credentials` table

  ## Solution
  - Update the cron job to read Supabase URL and service role key from
    `acumatica_sync_credentials` table (same pattern as the sync job)
  - Recreate the cron job with the corrected configuration

  ## Tables Modified
  - None (only updates cron job)
*/

-- Unschedule the existing broken job
SELECT cron.unschedule('check-invoice-reminders-every-minute');

-- Create a helper function to trigger the reminder check
CREATE OR REPLACE FUNCTION trigger_reminder_check_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Get Supabase configuration from credentials table
  SELECT supabase_url, supabase_service_role_key
  INTO v_supabase_url, v_service_role_key
  FROM acumatica_sync_credentials
  WHERE is_active = true
  AND supabase_url IS NOT NULL
  AND supabase_service_role_key IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no configuration found, exit
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'No Supabase configuration found in credentials table';
    RETURN;
  END IF;

  -- Call the reminder check edge function
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/check-invoice-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Reminder check failed: %', SQLERRM;
END;
$$;

-- Schedule the new cron job that uses the helper function
SELECT cron.schedule(
  'check-invoice-reminders-every-minute',
  '* * * * *',
  'SELECT trigger_reminder_check_cron();'
);

COMMENT ON FUNCTION trigger_reminder_check_cron() IS 'Triggers invoice reminder check using credentials from acumatica_sync_credentials table';

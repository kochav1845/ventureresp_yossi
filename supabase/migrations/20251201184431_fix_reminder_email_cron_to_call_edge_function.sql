/*
  # Fix Reminder Email Cron Job to Actually Call Edge Function

  ## Problem
  - Job #6 (send-reminder-emails) is just logging a notice, not calling the edge function
  - It needs to read Supabase URL and service role key from credentials table

  ## Solution
  - Update the function to call the actual send-reminder-emails edge function
  - Use the same pattern as the sync and reminder check jobs

  ## Tables Modified
  - None (only updates cron job function)
*/

-- Update the function to actually call the edge function
CREATE OR REPLACE FUNCTION send_reminder_emails_via_cron()
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

  -- Call the send-reminder-emails edge function
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-reminder-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Send reminder emails failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION send_reminder_emails_via_cron() IS 'Triggers send-reminder-emails edge function using credentials from acumatica_sync_credentials table';

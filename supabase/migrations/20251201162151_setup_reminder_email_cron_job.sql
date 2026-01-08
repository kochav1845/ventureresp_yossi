/*
  # Setup Reminder Email Cron Job
  
  1. Purpose
    - Create cron job to check and send reminder emails every hour
    - Run the send-reminder-emails edge function automatically
    
  2. Configuration
    - Runs every hour at minute 0
    - Calls the send-reminder-emails edge function
*/

-- Create function to trigger reminder emails
CREATE OR REPLACE FUNCTION trigger_reminder_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url text;
BEGIN
  function_url := current_setting('app.settings.supabase_url') || '/functions/v1/send-reminder-emails';
  
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule cron job to run every hour
SELECT cron.schedule(
  'send-reminder-emails-hourly',
  '0 * * * *',
  $$SELECT trigger_reminder_emails()$$
);

COMMENT ON FUNCTION trigger_reminder_emails IS 'Triggers the send-reminder-emails edge function to process and send reminder notifications';

/*
  # Setup Auto-Ticket Cron Job

  1. Creates a cron job that runs daily at 6:00 AM
  2. Calls the process-auto-ticket-rules edge function
  3. Processes all active auto-ticket rules and creates/updates tickets

  Schedule: 0 6 * * * (6:00 AM every day)
*/

-- Safely remove existing job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('process-auto-ticket-rules-daily');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create the cron job to run at 6:00 AM daily
SELECT cron.schedule(
  'process-auto-ticket-rules-daily',
  '0 6 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/process-auto-ticket-rules',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

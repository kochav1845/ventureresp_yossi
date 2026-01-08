/*
  # Setup Auto-Backfill Cron Job

  1. Changes
    - Creates a pg_cron job that runs every minute
    - Calls the auto-backfill-payment-data edge function
    - Automatically stops when backfill is complete
    - Uses pg_net to make HTTP request to edge function

  2. Security
    - Uses service role key for authentication
    - Only processes if backfill is not already complete
*/

-- First, remove any existing auto-backfill cron job
SELECT cron.unschedule('auto-backfill-payment-data-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-backfill-payment-data-job'
);

-- Create the cron job to run every minute
SELECT cron.schedule(
  'auto-backfill-payment-data-job',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-backfill-payment-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

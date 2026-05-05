/*
  # Setup daily cron job to reconcile balanced invoices

  1. Purpose
    - Runs daily at 5:00 AM to clean up stale "Balanced" invoices
    - Checks each balanced invoice against Acumatica's current data
    - Updates invoices whose status changed (e.g., Balanced -> Open or Closed)
    - Deletes invoices that no longer exist in Acumatica

  2. Schedule
    - Runs once daily at 5:00 AM UTC (before the workday starts)
    - Calls the `reconcile-balanced-invoices` edge function
*/

-- Safely remove existing job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-balanced-invoices-daily');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create the cron job to run at 5:00 AM daily
SELECT cron.schedule(
  'reconcile-balanced-invoices-daily',
  '0 5 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/reconcile-balanced-invoices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

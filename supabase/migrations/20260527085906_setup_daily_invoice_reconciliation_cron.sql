/*
  # Setup daily invoice reconciliation cron job

  1. Purpose
    - Creates a daily cron job at 3 AM UTC that calls the reconcile-invoice-statuses edge function
    - This function checks all Open/Credit Hold invoices and Closed Credit Memos against Acumatica
    - Fixes status and balance discrepancies that the incremental sync might miss

  2. Schedule
    - Runs daily at 3:00 AM UTC
    - Uses pg_net to call the edge function via HTTP

  3. Important Notes
    - This catches cases where Acumatica changes invoice status without updating LastModifiedDateTime
    - Also removes duplicate records (null customer copies) that may have been created by sync bugs
*/

SELECT cron.schedule(
  'reconcile-invoice-statuses-daily',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/reconcile-invoice-statuses',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := jsonb_build_object('mode', 'full', 'batchSize', 200)
    );
  $$
);

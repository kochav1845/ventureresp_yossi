/*
  # Fix reconciliation cron job batch size

  1. Changes
    - Updates the reconcile-invoice-statuses cron job batch size from 200 to 20
    - Batch size of 200 causes URL-too-long errors when building OData filters
    - Batch size of 20 is proven to work within Acumatica API URL limits

  2. Important Notes
    - The OData filter uses "ReferenceNbr eq '...'" for each invoice in a batch
    - With 200 items, the URL exceeds maximum length limits
    - 20 items per batch keeps URLs reasonable while still being efficient
*/

SELECT cron.unschedule('reconcile-invoice-statuses-daily');

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
      body := jsonb_build_object('mode', 'full', 'batchSize', 20)
    );
  $$
);

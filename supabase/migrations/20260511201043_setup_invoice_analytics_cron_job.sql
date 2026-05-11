/*
  # Setup Invoice Analytics Cron Job

  Sets up an hourly cron job to refresh the cached invoice analytics table.
  Refreshes monthly data for the current year, and yearly data.

  1. Cron Jobs
    - `refresh-invoice-analytics` - runs every hour at minute 30
      - Refreshes monthly aggregates for current year
      - Refreshes yearly aggregates
*/

-- Create the cron job to refresh invoice analytics every hour
SELECT cron.unschedule('refresh-invoice-analytics')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-invoice-analytics');

SELECT cron.schedule(
  'refresh-invoice-analytics',
  '30 * * * *',
  $$
    SELECT refresh_cached_invoice_analytics('monthly', EXTRACT(YEAR FROM now())::integer);
    SELECT refresh_cached_invoice_analytics('yearly');
  $$
);

-- Seed with initial data for common years
SELECT refresh_cached_invoice_analytics('monthly', 2024);
SELECT refresh_cached_invoice_analytics('monthly', 2025);
SELECT refresh_cached_invoice_analytics('monthly', 2026);
SELECT refresh_cached_invoice_analytics('yearly');

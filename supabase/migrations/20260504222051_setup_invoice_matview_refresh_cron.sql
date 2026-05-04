/*
  # Setup invoice materialized view refresh cron

  1. Changes
    - Creates a cron job to refresh `invoice_month_summary_mv` every hour
    - This keeps the Invoice Breakdown page data fresh without frontend-triggered refreshes
    - Uses REFRESH MATERIALIZED VIEW CONCURRENTLY so reads are not blocked

  2. Important Notes
    - The matview is also refreshed after invoice sync operations via edge functions
    - The hourly cron catches any changes from incremental syncs or manual edits
    - Uses the existing `refresh_invoice_month_summary()` function
*/

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-invoice-month-summary-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-invoice-month-summary-hourly',
  '15 * * * *',
  'SELECT refresh_invoice_month_summary();'
);

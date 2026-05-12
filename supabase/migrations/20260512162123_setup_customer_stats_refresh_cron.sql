/*
  # Setup Customer Stats Refresh Cron Job

  Creates a cron job that refreshes the cached customer summary statistics
  every 5 minutes so the Customers page loads instantly.

  1. Cron Jobs
    - `refresh-customer-stats` - runs every 5 minutes
      - Calls refresh_cached_customer_stats() to recompute totals
*/

SELECT cron.unschedule('refresh-customer-stats')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-customer-stats');

SELECT cron.schedule(
  'refresh-customer-stats',
  '*/5 * * * *',
  $$ SELECT refresh_cached_customer_stats(); $$
);

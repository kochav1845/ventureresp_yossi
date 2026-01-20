/*
  # Payment Sync Health Check Cron Job

  1. Purpose
    - Automatically runs a daily health check on payment sync accuracy
    - Verifies that payments in the database match their status in Acumatica
    - Logs results for monitoring and alerting

  2. Schedule
    - Runs daily at 6:00 AM UTC
    - Checks a sample of 100 recent payments (last 30 days)
    - Results are logged to sync_change_logs table

  3. How It Works
    - Fetches a sample of recent payments from the database
    - Compares each payment's status with Acumatica's current data
    - Detects mismatches and calculates sync health percentage
    - Logs the results with health status (healthy/warning/critical)

  4. Monitoring
    - Check sync_change_logs table for entity_type='payment', sync_type='health_verification'
    - Health statuses:
      - healthy: 95%+ sync accuracy
      - warning: 85-95% sync accuracy
      - critical: <85% sync accuracy
*/

-- Create a cron job to run payment sync health check daily at 6 AM UTC
SELECT cron.schedule(
  'payment-sync-health-check-daily',
  '0 6 * * *',  -- Daily at 6 AM UTC
  $$
    SELECT
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/verify-payment-sync-health',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
        ),
        body := jsonb_build_object('sampleSize', 100)
      );
  $$
);

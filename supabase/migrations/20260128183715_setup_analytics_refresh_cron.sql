/*
  # Setup Hourly Analytics Refresh Cron Job

  1. Cron Configuration
    - Runs every hour at minute 0
    - Calls calculate-payment-analytics edge function
    - Refreshes monthly data for current year
    - Refreshes yearly data for last 6 years
    - Refreshes daily data for current month

  2. Security
    - Uses stored Supabase credentials for authentication
    - Edge function handles all permissions internally
*/

-- Create function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_payment_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  supabase_url text;
  supabase_key text;
  current_year integer;
  current_month integer;
  response_status integer;
  start_time timestamptz;
  execution_time_ms integer;
BEGIN
  start_time := clock_timestamp();

  -- Get stored credentials
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  SELECT decrypted_secret INTO supabase_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  -- Get current date info
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);

  -- Refresh daily analytics for current month
  SELECT status INTO response_status
  FROM http((
    'POST',
    supabase_url || '/functions/v1/calculate-payment-analytics',
    ARRAY[
      http_header('Authorization', 'Bearer ' || supabase_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    json_build_object(
      'periodType', 'daily',
      'year', current_year,
      'month', current_month
    )::text
  )::http_request);

  -- Refresh monthly analytics for current year
  SELECT status INTO response_status
  FROM http((
    'POST',
    supabase_url || '/functions/v1/calculate-payment-analytics',
    ARRAY[
      http_header('Authorization', 'Bearer ' || supabase_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    json_build_object(
      'periodType', 'monthly',
      'year', current_year
    )::text
  )::http_request);

  -- Refresh yearly analytics
  SELECT status INTO response_status
  FROM http((
    'POST',
    supabase_url || '/functions/v1/calculate-payment-analytics',
    ARRAY[
      http_header('Authorization', 'Bearer ' || supabase_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    json_build_object(
      'periodType', 'yearly'
    )::text
  )::http_request);

  -- Calculate execution time
  execution_time_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time)::integer;

  -- Log success
  INSERT INTO cron_job_logs (job_name, status, response_data, execution_time_ms)
  VALUES (
    'refresh-payment-analytics-hourly',
    'completed',
    json_build_object(
      'daily_year', current_year,
      'daily_month', current_month,
      'monthly_year', current_year
    ),
    execution_time_ms
  );

EXCEPTION WHEN OTHERS THEN
  -- Calculate execution time for error case
  execution_time_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time)::integer;

  -- Log error
  INSERT INTO cron_job_logs (job_name, status, error_message, execution_time_ms)
  VALUES (
    'refresh-payment-analytics-hourly',
    'error',
    SQLERRM,
    execution_time_ms
  );
END;
$$;

-- Try to unschedule existing job (ignore error if doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-payment-analytics-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Create cron job to refresh payment analytics every hour
SELECT cron.schedule(
  'refresh-payment-analytics-hourly',
  '0 * * * *',
  'SELECT refresh_payment_analytics();'
);
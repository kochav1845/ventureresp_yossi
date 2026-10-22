/*
  # refresh_payment_analytics has failed every hour since May (audit 20 / 42)

  cron_job_logs holds 3,420 rows for 'refresh-payment-analytics-hourly' with
  status='error' and error_message='http_request.uri is NULL' -- the first on
  2026-05-28 07:32 and the most recent 2026-10-21 17:00. Meanwhile
  cron.job_run_details reported jobid 17 as 'succeeded' every single time,
  because the function caught its own exception and returned normally. The tell
  was the duration: 42-164 ms for what should be six edge-function POSTs.

  Cause: it read its URL and key from vault.decrypted_secrets, and that view is
  EMPTY on this project -- no secrets at all. Both SELECT INTOs left NULL, and
  http() refuses a NULL uri.

  Every other cron wrapper here (send_reminder_emails_via_cron,
  trigger_reminder_check_cron) reads acumatica_sync_credentials instead, which
  does hold a live supabase_url and supabase_service_role_key. This now does the
  same, raises if either is missing rather than continuing into a guaranteed
  failure, and re-raises after logging so a dead refresh shows up as a FAILED
  cron run instead of only in a table nobody reads.

  It also now checks the HTTP status of each call rather than discarding it, so
  a 4xx/5xx from calculate-payment-analytics is recorded too.

  Staleness this leaves behind, for the live org: period_type='monthly' newest
  calculated_at 2026-09-06 (46 days), 'yearly' 2026-08-25 (58 days). Payment
  Analytics renders those rows with no age check, so September showed $172,428
  collected against a real $2,061,111 and 2026 showed $13.6M against $18.3M.
  The frontend age check is a separate change; this migration repairs the
  refresh and the migration is followed by a manual run to rebuild the rows.
*/

CREATE OR REPLACE FUNCTION public.refresh_payment_analytics()
RETURNS void
LANGUAGE plpgsql
-- Six edge-function calls, each of which can take tens of seconds.
SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_supabase_url text;
  v_supabase_key text;
  current_year int;
  current_month int;
  org record;
  start_time timestamptz := clock_timestamp();
  v_status int;
  v_calls int := 0;
  v_failures int := 0;
  v_payload text;
  v_period text;
BEGIN
  -- vault.decrypted_secrets is empty on this project; this is where the other
  -- cron wrappers get their credentials.
  SELECT c.supabase_url, c.supabase_service_role_key
    INTO v_supabase_url, v_supabase_key
  FROM acumatica_sync_credentials c
  WHERE c.is_active = true
    AND c.supabase_url IS NOT NULL
    AND c.supabase_service_role_key IS NOT NULL
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_supabase_url IS NULL OR v_supabase_key IS NULL THEN
    RAISE EXCEPTION 'refresh_payment_analytics: no active Supabase credentials in acumatica_sync_credentials';
  END IF;

  -- The http extension defaults to a 5 second timeout, which
  -- calculate-payment-analytics exceeds; without this every call fails with
  -- "Operation timed out after 5002 milliseconds".
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '180');

  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);

  FOR org IN SELECT id FROM organizations LOOP
    FOREACH v_period IN ARRAY ARRAY['daily', 'monthly', 'yearly'] LOOP
      v_payload := CASE v_period
        WHEN 'daily'   THEN json_build_object('periodType','daily','year',current_year,'month',current_month,'organizationId',org.id)::text
        WHEN 'monthly' THEN json_build_object('periodType','monthly','year',current_year,'organizationId',org.id)::text
        ELSE                json_build_object('periodType','yearly','organizationId',org.id)::text
      END;

      -- The status was previously PERFORMed and discarded, so an edge function
      -- returning 500 looked identical to success. Each call is isolated so one
      -- slow or failing organization does not cost the others their refresh.
      v_calls := v_calls + 1;
      BEGIN
        SELECT status INTO v_status FROM http((
          'POST',
          v_supabase_url || '/functions/v1/calculate-payment-analytics',
          ARRAY[http_header('Authorization', 'Bearer ' || v_supabase_key),
                http_header('Content-Type', 'application/json')],
          'application/json',
          v_payload
        )::http_request);

        IF v_status IS NULL OR v_status >= 300 THEN
          v_failures := v_failures + 1;
          RAISE WARNING 'calculate-payment-analytics % for org % returned %', v_period, org.id, v_status;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_failures := v_failures + 1;
        RAISE WARNING 'calculate-payment-analytics % for org % raised: %', v_period, org.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  INSERT INTO cron_job_logs(job_name, status, response_data, execution_time_ms)
  VALUES ('refresh-payment-analytics-hourly',
          -- 'success', not 'completed': cron_job_logs_status_check allows only
          -- success/failed/error, so the original's 'completed' would have
          -- violated the constraint even once the URL resolved -- and that
          -- throw would have been swallowed into an 'error' row too.
          CASE WHEN v_failures = 0 THEN 'success' ELSE 'error' END,
          json_build_object('orgs_refreshed', (SELECT count(*) FROM organizations),
                            'calls', v_calls, 'failures', v_failures),
          EXTRACT(MILLISECOND FROM clock_timestamp() - start_time)::int);

  IF v_failures > 0 THEN
    RAISE EXCEPTION 'refresh_payment_analytics: % of % calls failed', v_failures, v_calls;
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_job_logs(job_name, status, error_message, execution_time_ms)
  VALUES ('refresh-payment-analytics-hourly', 'error', SQLERRM,
          EXTRACT(MILLISECOND FROM clock_timestamp() - start_time)::int);
  -- Re-raised on purpose. Swallowing this is why 3,420 consecutive failures
  -- were recorded as successful cron runs for five months.
  RAISE;
END;
$function$;

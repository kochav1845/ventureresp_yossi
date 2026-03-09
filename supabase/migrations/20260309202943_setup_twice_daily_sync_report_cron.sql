/*
  # Setup Twice-Daily Sync Report Cron Job

  1. New Cron Jobs
    - `send-sync-report-morning` - Sends sync report at 8:00 AM Eastern (12:00 UTC)
    - `send-sync-report-evening` - Sends sync report at 5:00 PM Eastern (21:00 UTC)

  2. New Functions
    - `trigger_sync_report` - Fires an HTTP request to the send-sync-report edge function

  3. Important Notes
    - Reports are sent twice daily to all active recipients in sync_report_recipients
    - Uses pg_net to call the edge function via HTTP
    - Credentials are read from acumatica_sync_credentials table
*/

CREATE OR REPLACE FUNCTION trigger_sync_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
BEGIN
  SELECT supabase_url, supabase_anon_key
  INTO v_supabase_url, v_anon_key
  FROM acumatica_sync_credentials
  WHERE is_active = true
    AND supabase_url IS NOT NULL
    AND supabase_anon_key IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RAISE NOTICE 'No configuration found for sync report trigger';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-sync-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'Content-Type', 'application/json',
      'apikey', v_anon_key
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Sync report email triggered';
END;
$$;

SELECT cron.schedule(
  'send-sync-report-morning',
  '0 12 * * *',
  'SELECT trigger_sync_report()'
);

SELECT cron.schedule(
  'send-sync-report-evening',
  '0 21 * * *',
  'SELECT trigger_sync_report()'
);
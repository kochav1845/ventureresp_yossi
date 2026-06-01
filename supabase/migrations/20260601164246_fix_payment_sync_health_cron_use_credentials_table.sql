/*
  # Fix payment sync health check cron job

  1. Changes
    - Creates `trigger_verify_payment_sync_health()` function that reads URL from credentials table
    - Replaces failing cron job 14 which had same "unrecognized configuration parameter" error
*/

CREATE OR REPLACE FUNCTION trigger_verify_payment_sync_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
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
    RAISE NOTICE 'No credentials found for verify-payment-sync-health';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/verify-payment-sync-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := jsonb_build_object('sampleSize', 100)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Verify payment sync health failed: %', SQLERRM;
END;
$func$;

-- Replace cron job 14
SELECT cron.unschedule(14);
SELECT cron.schedule(
  'verify-payment-sync-health',
  '0 6 * * *',
  'SELECT trigger_verify_payment_sync_health();'
);
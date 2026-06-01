/*
  # Fix reconciliation cron jobs - use credentials table instead of GUC variables

  1. Changes
    - Creates `trigger_reconcile_balanced_invoices()` function that reads Supabase URL and anon key from acumatica_sync_credentials table
    - Creates `trigger_reconcile_invoice_statuses()` function similarly
    - Replaces failing cron job commands (jobs 28 and 34) with calls to these new functions
    - These were failing daily with: "unrecognized configuration parameter app.settings.supabase_url"

  2. Important Notes
    - Root cause: cron jobs used `current_setting('app.settings.supabase_url')` which is not configured
    - Fix: Read URL and key from `acumatica_sync_credentials` table (same pattern as the working trigger_acumatica_sync function)
*/

-- Create helper function for reconcile-balanced-invoices cron
CREATE OR REPLACE FUNCTION trigger_reconcile_balanced_invoices()
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
    RAISE NOTICE 'No credentials found for reconcile-balanced-invoices';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/reconcile-balanced-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Reconcile balanced invoices triggered successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Reconcile balanced invoices failed: %', SQLERRM;
END;
$func$;

-- Create helper function for reconcile-invoice-statuses cron
CREATE OR REPLACE FUNCTION trigger_reconcile_invoice_statuses()
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
    RAISE NOTICE 'No credentials found for reconcile-invoice-statuses';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/reconcile-invoice-statuses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := jsonb_build_object('mode', 'full', 'batchSize', 20)
  );

  RAISE NOTICE 'Reconcile invoice statuses triggered successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Reconcile invoice statuses failed: %', SQLERRM;
END;
$func$;

-- Update cron job 28: reconcile-balanced-invoices (runs daily at 5 AM)
SELECT cron.unschedule(28);
SELECT cron.schedule(
  'reconcile-balanced-invoices',
  '0 5 * * *',
  'SELECT trigger_reconcile_balanced_invoices();'
);

-- Update cron job 34: reconcile-invoice-statuses (runs daily at 3 AM)
SELECT cron.unschedule(34);
SELECT cron.schedule(
  'reconcile-invoice-statuses',
  '0 3 * * *',
  'SELECT trigger_reconcile_invoice_statuses();'
);
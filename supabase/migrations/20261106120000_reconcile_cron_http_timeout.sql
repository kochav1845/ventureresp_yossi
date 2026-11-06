/*
  # Reconcile crons: give pg_net a timeout long enough to wait for the response

  Incident #5220 (2026-11-06 06:02 UTC):
      reconcile-invoice-statuses: Http: connection closed before message completed

  trigger_reconcile_invoice_statuses() (from
  20260601164212_fix_reconciliation_cron_jobs_use_credentials_table.sql) fires
  the reconcile-invoice-statuses edge function with net.http_post but passes no
  timeout_milliseconds, so pg_net falls back to its short default (~5 s) and
  closes the connection almost immediately. The edge function does not know the
  client left and keeps working: its Acumatica walk is bounded by an internal
  110 s budget (TIME_BUDGET_MS) and the whole run -- setup, walk, cursor write,
  sync_change_logs insert -- took ~150 s this night. When it finally called
  respondWith, the socket pg_net had opened was long gone, which is the
  "connection closed before message completed" error. The work itself completed
  (reconcile_cursor PATCH 204 and sync_change_logs POST 201 are in the log
  seconds before the error) -- no data was lost -- but the run is recorded as an
  error every night the walk runs long.

  Fix: pass timeout_milliseconds so pg_net waits for the real response, exactly
  as 20261023120000_reminder_cron_key_from_vault.sql already does for the
  reminder-email cron. 300000 ms (5 min) sits comfortably above the function's
  110 s internal walk budget and the ~150 s observed full run, and well under the
  cron interval, so a run can never close early and runs never pile up.

  trigger_reconcile_balanced_invoices() (same migration, same file) has the
  identical missing-timeout defect and calls the equally long reconcile-balanced
  -invoices function, so it is fixed here too before it produces the same error
  under its own slug.

  Only net.http_post gains the timeout argument. Everything else -- the
  credentials lookup, the URL/key/body, the cron schedules, SECURITY DEFINER,
  the service_role-only EXECUTE grant (20261021280000) and the
  search_path = public, extensions hardening (20260716030000) -- is preserved
  unchanged. The search_path is re-stated in the body because CREATE OR REPLACE
  would otherwise drop the setting the later ALTER FUNCTION added.
*/

-- reconcile-balanced-invoices cron wrapper
CREATE OR REPLACE FUNCTION public.trigger_reconcile_balanced_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );

  RAISE NOTICE 'Reconcile balanced invoices triggered successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Reconcile balanced invoices failed: %', SQLERRM;
END;
$func$;

-- reconcile-invoice-statuses cron wrapper (incident #5220)
CREATE OR REPLACE FUNCTION public.trigger_reconcile_invoice_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
    body := jsonb_build_object('mode', 'full', 'batchSize', 20),
    timeout_milliseconds := 300000
  );

  RAISE NOTICE 'Reconcile invoice statuses triggered successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Reconcile invoice statuses failed: %', SQLERRM;
END;
$func$;

-- Preserve the service_role-only EXECUTE grant (20261021280000); CREATE OR
-- REPLACE keeps existing grants, these are restated to be explicit.
REVOKE ALL ON FUNCTION public.trigger_reconcile_balanced_invoices() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_reconcile_invoice_statuses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reconcile_balanced_invoices() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_reconcile_invoice_statuses() TO service_role;

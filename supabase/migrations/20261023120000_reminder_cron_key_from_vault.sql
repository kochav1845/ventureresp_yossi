/*
  # Reminder emails: the cron has been sending a placeholder instead of a key

  Since 0c5fa2e (2026-10-22, audit 49) send-reminder-emails has verify_jwt=true
  and only accepts the service-role key or an approved admin/manager session.
  Its cron wrapper send_reminder_emails_via_cron() took the key from
  acumatica_sync_credentials.supabase_service_role_key -- and that column has
  held a 26-character placeholder (not a JWT, matches no project key) since the
  row was created on 2025-12-01. It only ever "worked" because the function used
  to accept anything. From the lockdown on, every five-minute run was refused at
  the gateway:

      401 {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}

  while cron.job_run_details kept recording each run as 'succeeded', because
  net.http_post only reports that the request was queued.

  ## Why not just put the real key in that column

  acumatica_sync_credentials is SELECT- and INSERT-able by any user whose
  user_profiles.role is 'admin', in ANY organization (no org predicate). So:
    1. Storing the service-role key there hands the master key to every org's
       admin through the REST API.
    2. The wrapper also took its URL from that table (newest active row), so an
       admin could insert a newer row pointing at their own server and this
       cron would post the key to it every five minutes.

  ## What this does

  - The key now comes from Vault (vault.decrypted_secrets name
    'service_role_key'), readable only by postgres and service_role and not
    exposed through PostgREST. The secret itself is created out of band with
    vault.create_secret() and is never in git.
  - The URL is this project's own, fixed. Nothing an app user can write decides
    where the key is sent.
  - A missing secret now RAISES, so the cron run is recorded as failed instead
    of succeeding silently.
  - pg_net's default 5 s timeout is raised to 30 s: the function mails each due
    reminder serially through send-email-reply.
  - EXECUTE is limited to postgres (the cron owner) and service_role. It was
    granted to PUBLIC/anon/authenticated.

  Not changed here (they still read the same placeholder, but their targets
  have verify_jwt=false and no auth check, so they currently get 200):
  trigger_reminder_check_cron() -> check-invoice-reminders and
  refresh_payment_analytics() -> calculate-payment-analytics. Either breaks the
  same way the day its target function is locked down; move them to this
  pattern at that time.
*/

CREATE OR REPLACE FUNCTION public.send_reminder_emails_via_cron()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- Fixed on purpose: never read the destination from a table app users can
  -- write, because the service-role key travels with the request.
  v_url constant text := 'https://leipneymocoksmajxnok.supabase.co/functions/v1/send-reminder-emails';
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'send_reminder_emails_via_cron: vault secret "service_role_key" is missing';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_reminder_emails_via_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_reminder_emails_via_cron() TO service_role;

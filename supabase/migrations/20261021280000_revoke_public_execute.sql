/*
  # anon could still execute every SECURITY DEFINER function (audit C3 / C6)

  CORRECTION to 20261021210000. That migration did:

      REVOKE EXECUTE ON FUNCTION public.delete_extra_payment(text, text) FROM anon;

  which is a no-op. PostgreSQL grants EXECUTE on a new function to PUBLIC by
  default, and anon inherits it through PUBLIC -- revoking the role's own
  (non-existent) grant changes nothing. Checked after that migration:
  has_function_privilege('anon', 'delete_extra_payment(text,text)', 'EXECUTE')
  was still true, as it was for all eight functions the audit named. The
  in-function is_admin() guard added at the same time is what has actually been
  holding delete_extra_payment shut.

  So: revoke from PUBLIC (and anon explicitly) on every SECURITY DEFINER
  function in public, then grant back deliberately. 60 of the 65 were reachable
  by anon, 23 of them mutating. Beyond the eight named, that included
  update_auto_ticket_cron_schedule (anyone could rewrite the cron schedule),
  four trigger_* functions (anyone could kick off a sync or the email
  scheduler), refresh_invoice_month_summary (anyone could force an expensive
  refresh), and read functions that bypass RLS by definition:
  get_customer_statements_summary (org-wide AR), search_customers_fuzzy
  (customer PII) and get_available_collectors (staff names and emails).

  Nothing signed-out needs any of them: the only pre-auth queries in the app are
  plain table reads of pending_users (sign-in) and interest_requests (landing
  page), and the password-reset and signup flows go through edge functions on
  the service-role key.

  Trigger functions are skipped -- they are not callable through PostgREST, and
  EXECUTE on them is checked when the trigger is created, not when it fires.

  delete_extra_invoice gets the guard its twin already has: it is the same
  cascade delete over seven child tables, and it had none.
*/

DO $$
DECLARE
  r record;
  -- Cron and maintenance entry points. Nothing a signed-in user should be able
  -- to call; the schedulers and edge functions reach them as service_role.
  v_service_only text[] := ARRAY[
    'auto_close_tickets_with_no_unpaid_invoices',
    'close_fully_paid_invoices',
    'evaluate_email_for_proposed_reminders',
    'process_auto_ticket_rules',
    'refresh_cached_customer_balances',
    'refresh_cached_customer_stats',
    'refresh_cached_invoice_analytics_for_org',
    'refresh_payment_month_summary',
    'resolve_proposed_reminder_assignee',
    'trigger_reconcile_balanced_invoices',
    'trigger_reconcile_invoice_statuses',
    'trigger_verify_payment_sync_health'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);

    IF r.proname = ANY (v_service_only) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;

-- Same cascade, same exposure, no guard at all. Mirrors delete_extra_payment.
CREATE OR REPLACE FUNCTION public.delete_extra_invoice(p_reference_number text, p_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_deleted integer := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only an admin can delete an invoice';
  END IF;

  SELECT id INTO v_invoice_id
  FROM acumatica_invoices
  WHERE reference_number = p_reference_number
    AND type = p_type
    AND organization_id = get_user_org_id();

  IF v_invoice_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM invoice_change_log WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_activity_log WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_reminders WHERE invoice_id = v_invoice_id;
  DELETE FROM user_reminder_notifications WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_status_changes WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_memos WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_collector_assignments WHERE invoice_id = v_invoice_id;

  DELETE FROM acumatica_invoices WHERE id = v_invoice_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_extra_invoice(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_extra_invoice(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_extra_invoice(text, text) TO authenticated, service_role;

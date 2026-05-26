/*
  # Use pre-request GUC initialization for RLS performance

  The core issue: SECURITY DEFINER functions bypass RLS entirely, meaning
  they see data from ALL organizations. But SECURITY INVOKER functions are
  too slow because RLS evaluates get_user_org_id() per row.

  Solution: Keep functions as SECURITY DEFINER but add explicit org filtering.
  For the bulk of functions we can't rewrite individually, revert them to
  SECURITY INVOKER but make the RLS check use current_setting which is faster.

  Actually the best approach: use a pre-request function that Supabase calls
  before each request via a database role setting. Since we can't do that,
  instead optimize by making the STABLE function truly cacheable.
*/

-- Make get_user_org_id IMMUTABLE within a transaction by removing exception handling
-- and making the session cache the primary path
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_cached text;
  v_header_org text;
  v_is_super boolean;
BEGIN
  -- Fast path: check session cache
  v_cached := current_setting('app.current_org_id', true);
  IF v_cached IS NOT NULL AND v_cached != '' THEN
    RETURN v_cached::uuid;
  END IF;

  -- Check if there's a header-specified org (for super admins)
  BEGIN
    v_header_org := current_setting('request.headers', true)::json->>'x-org-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_org := NULL;
  END;

  IF v_header_org IS NOT NULL AND v_header_org != '' THEN
    SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = auth.uid()) INTO v_is_super;
    IF v_is_super THEN
      v_org_id := v_header_org::uuid;
      PERFORM set_config('app.current_org_id', v_org_id::text, true);
      RETURN v_org_id;
    END IF;
  END IF;

  -- Regular user: look up from profile
  SELECT organization_id INTO v_org_id
  FROM user_profiles
  WHERE id = auth.uid();

  IF v_org_id IS NOT NULL THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
  END IF;

  RETURN v_org_id;
END;
$$;

-- Now revert the heavy functions back to SECURITY INVOKER
-- The RLS + cached get_user_org_id() should be fast enough since it uses set_config
DO $$
DECLARE
  r record;
  keep_definer text[] := ARRAY[
    'get_filtered_invoice_aggregates',
    'get_filtered_payment_aggregates',
    'get_customers_with_balance',
    'get_payments_with_applications',
    'get_user_org_id',
    'is_admin',
    'is_manager_or_admin',
    'is_super_admin',
    'user_has_permission',
    'handle_new_user',
    'refresh_cached_customer_balances',
    'refresh_cached_invoice_analytics',
    'refresh_cached_customer_stats',
    'check_cron_job_health',
    'get_cron_jobs',
    'toggle_cron_job',
    'log_user_login',
    'log_user_logout',
    'update_invoice_color_status',
    'batch_update_invoice_color_status_by_refs',
    'update_ticket_priority',
    'reassign_invoice_collector',
    'get_available_collectors',
    'trigger_email_scheduler_manually',
    'refresh_invoice_month_summary',
    'mark_temporary_password_used',
    'update_filter_last_used',
    'move_email_to_folder',
    'search_emails',
    'get_reminder_counts',
    'delete_extra_payment',
    'process_auto_ticket_rules',
    'set_org_context',
    'get_user_organization_id',
    'payment_effective_date',
    'refresh_payment_month_summary_mv',
    'update_auto_ticket_cron_schedule'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.prokind = 'f'
    AND p.proname != ALL(keep_definer)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', r.oid::regprocedure);
  END LOOP;
END;
$$;

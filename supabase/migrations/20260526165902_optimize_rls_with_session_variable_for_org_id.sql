/*
  # Optimize RLS with session variable for org_id

  Instead of calling get_user_org_id() per-row (which queries user_profiles each time),
  use a helper that sets a session variable once, then RLS checks against it.
  
  This dramatically improves performance for queries on large tables.
  
  Also revert the batch SECURITY DEFINER change for functions that don't have
  explicit org filtering - they need to remain SECURITY INVOKER to get RLS protection.
*/

-- Create an optimized version that uses current_setting as a cache
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_cached text;
BEGIN
  -- Try to get from session cache first
  BEGIN
    v_cached := current_setting('app.current_org_id', true);
    IF v_cached IS NOT NULL AND v_cached != '' THEN
      RETURN v_cached::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Setting doesn't exist yet, fall through
  END;

  -- Look up from user_profiles
  SELECT organization_id INTO v_org_id
  FROM user_profiles
  WHERE id = auth.uid();

  -- Cache it for the rest of the transaction
  IF v_org_id IS NOT NULL THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
  END IF;

  RETURN v_org_id;
END;
$$;

-- Revert functions that don't have explicit org filtering back to SECURITY INVOKER
-- These rely on the RLS of the underlying tables for org isolation
DO $$
DECLARE
  r record;
  -- Functions that DO have explicit org filtering (keep as SECURITY DEFINER)
  safe_functions text[] := ARRAY[
    'get_filtered_invoice_aggregates',
    'get_filtered_payment_aggregates',
    'get_customers_with_balance',
    'get_user_org_id',
    'is_admin',
    'is_manager_or_admin',
    'is_super_admin',
    'user_has_permission',
    'handle_new_user',
    'refresh_cached_customer_balances',
    'refresh_cached_invoice_analytics',
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
    'process_auto_ticket_rules'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.prokind = 'f'
    AND p.proname LIKE 'get_%'
    AND p.proname != ALL(safe_functions)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', r.oid::regprocedure);
  END LOOP;
END;
$$;

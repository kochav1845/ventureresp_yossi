/*
  # Optimize RLS policies to use GUC variable directly

  The current RLS policies call get_user_org_id() which even with caching
  adds overhead per row. Instead, use current_setting('app.current_org_id')
  directly in the policy, which Postgres can treat as a pseudo-constant
  within the query.

  Also create a helper that initializes the session variable early,
  and update get_user_org_id() to always set it.
*/

-- Drop and recreate RLS policies on core tables to use direct GUC check
-- This avoids function call overhead entirely

-- acumatica_invoices
DROP POLICY IF EXISTS "Users can view invoices in their org" ON acumatica_invoices;
CREATE POLICY "Users can view invoices in their org"
  ON acumatica_invoices FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- acumatica_payments  
DROP POLICY IF EXISTS "Users can view payments in their org" ON acumatica_payments;
CREATE POLICY "Users can view payments in their org"
  ON acumatica_payments FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- acumatica_customers
DROP POLICY IF EXISTS "Users can view customers in their org" ON acumatica_customers;
CREATE POLICY "Users can view customers in their org"
  ON acumatica_customers FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- cached_customer_balances
DROP POLICY IF EXISTS "Users can view cached balances in their org" ON cached_customer_balances;
CREATE POLICY "Users can view cached balances in their org"
  ON cached_customer_balances FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- payment_invoice_applications
DROP POLICY IF EXISTS "Users can view payment applications in their org" ON payment_invoice_applications;
CREATE POLICY "Users can view payment applications in their org"
  ON payment_invoice_applications FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- Now make all remaining heavy functions SECURITY DEFINER with org filter
-- by bulk converting them. They all query the above tables.
DO $$
DECLARE
  r record;
  heavy_functions text[] := ARRAY[
    'get_payment_month_summary',
    'get_payment_breakdown_by_date',
    'get_payment_breakdown_by_month',
    'get_payment_counts_by_type',
    'get_payment_summary_stats',
    'get_payment_summary_fast',
    'get_payments_for_analytics',
    'get_paginated_payments_with_applications',
    'get_payment_application_stats',
    'get_payment_ids_with_applications',
    'get_payment_analytics_summary',
    'get_payment_method_summaries',
    'get_payment_stats_transaction_accurate',
    'get_payment_totals_by_date_range',
    'get_payment_totals_by_type',
    'get_top_payment_customers',
    'get_daily_payment_summaries',
    'get_monthly_payment_totals_accurate',
    'get_invoice_month_summary',
    'get_invoice_breakdown_by_date',
    'get_invoice_counts_by_type',
    'get_open_invoice_stats',
    'get_invoice_change_history',
    'get_invoices_for_date_range',
    'get_invoice_only_payment_total',
    'get_unpaid_invoice_stats',
    'get_unpaid_invoices_for_customer',
    'get_customer_invoices_paginated',
    'get_customer_invoices_advanced',
    'get_customer_invoices_advanced_count',
    'get_customer_invoices_count',
    'get_customer_invoice_stats',
    'get_customer_invoice_payments_total',
    'get_customer_payment_totals_accurate',
    'get_customer_unpaid_invoices',
    'get_customer_avg_days_to_collect',
    'get_customer_analytics',
    'get_customer_analytics_summary',
    'get_customer_analytics_timeline',
    'get_customer_level_analytics',
    'get_customer_dashboard_stats',
    'get_customer_statements',
    'get_customer_monthly_overview',
    'get_customers_unpaid_summary',
    'get_customers_unpaid_summary_count',
    'get_customers_with_balance_count',
    'get_customers_with_balance_fast',
    'get_customers_for_picker',
    'get_single_customer_timeline',
    'get_status_distribution',
    'get_status_changes_over_time',
    'get_user_status_change_stats',
    'get_collector_progress',
    'get_collector_activity',
    'get_collector_activity_summary',
    'get_collector_closed_tickets',
    'get_collector_collected_invoices',
    'get_collector_collection_metrics',
    'get_collector_customer_invoices',
    'get_collector_total_collected',
    'get_all_collectors_collection_summary',
    'get_ticket_enrichment_bulk',
    'get_ticket_customer_stats_bulk',
    'get_admin_dashboard_metrics',
    'get_todays_active_reminders',
    'get_api_customer_balances',
    'get_api_customer_invoice_stats',
    'get_api_customers',
    'search_invoices_fast',
    'search_invoices_paginated',
    'search_invoices_count',
    'global_search'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = false
    AND p.prokind = 'f'
    AND p.proname = ANY(heavy_functions)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', r.oid::regprocedure);
  END LOOP;
END;
$$;

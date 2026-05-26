/*
  # Revert search functions to SECURITY INVOKER

  These need RLS protection for org isolation. With the optimized
  get_user_org_id() that uses session caching, performance should be adequate.
*/

DO $$
DECLARE
  r record;
  invoker_functions text[] := ARRAY[
    'search_invoices_fast', 'search_invoices_paginated', 'search_invoices_count',
    'global_search',
    'get_invoice_month_summary', 'get_invoice_breakdown_by_date',
    'get_invoice_counts_by_type', 'get_open_invoice_stats',
    'get_payment_month_summary', 'get_payment_breakdown_by_date',
    'get_payment_breakdown_by_month', 'get_payment_counts_by_type',
    'get_payment_summary_stats', 'get_payment_summary_fast',
    'get_payments_for_analytics', 'get_payments_with_applications',
    'get_paginated_payments_with_applications',
    'get_payment_application_stats', 'get_payment_ids_with_applications',
    'get_customer_analytics', 'get_customer_analytics_summary',
    'get_customer_analytics_timeline', 'get_customer_level_analytics',
    'get_customer_invoices_paginated', 'get_customer_invoices_advanced',
    'get_customer_invoices_advanced_count', 'get_customer_invoices_count',
    'get_customer_invoice_stats', 'get_customer_avg_days_to_collect',
    'get_customer_dashboard_stats', 'get_customer_statements',
    'get_customers_unpaid_summary', 'get_customers_unpaid_summary_count',
    'get_customers_with_balance_count', 'get_customers_with_balance_fast',
    'get_customers_for_picker', 'get_customer_unpaid_invoices',
    'get_single_customer_timeline', 'get_customer_monthly_overview',
    'get_status_distribution', 'get_status_changes_over_time',
    'get_user_status_change_stats',
    'get_collector_progress', 'get_collector_activity',
    'get_collector_activity_summary', 'get_collector_closed_tickets',
    'get_collector_collected_invoices', 'get_collector_collection_metrics',
    'get_collector_customer_invoices', 'get_collector_total_collected',
    'get_all_collectors_collection_summary',
    'get_ticket_enrichment_bulk', 'get_ticket_customer_stats_bulk',
    'get_unpaid_invoices_for_customer', 'get_unpaid_invoice_stats',
    'get_admin_dashboard_metrics',
    'get_todays_active_reminders',
    'get_invoice_change_history',
    'get_customer_invoice_payments_total',
    'get_customer_payment_totals_accurate',
    'get_monthly_payment_totals_accurate'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.prokind = 'f'
    AND p.proname = ANY(invoker_functions)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', r.oid::regprocedure);
  END LOOP;
END;
$$;

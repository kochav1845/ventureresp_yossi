/*
  # Change user-facing functions to SECURITY INVOKER

  All get_* and search_* functions called by users should respect RLS.
  Background/system functions (refresh_*, process_*, auto_*) stay as DEFINER.
*/

ALTER FUNCTION get_admin_dashboard_metrics SECURITY INVOKER;
ALTER FUNCTION get_all_collectors_collection_summary SECURITY INVOKER;
ALTER FUNCTION get_collector_closed_tickets SECURITY INVOKER;
ALTER FUNCTION get_collector_collected_invoices SECURITY INVOKER;
ALTER FUNCTION get_collector_collection_metrics SECURITY INVOKER;
ALTER FUNCTION get_collector_customer_invoices SECURITY INVOKER;
ALTER FUNCTION get_collector_progress SECURITY INVOKER;
ALTER FUNCTION get_customer_analytics_summary SECURITY INVOKER;
ALTER FUNCTION get_customer_analytics_timeline SECURITY INVOKER;
ALTER FUNCTION get_customer_invoice_stats SECURITY INVOKER;
ALTER FUNCTION get_customer_level_analytics SECURITY INVOKER;
ALTER FUNCTION get_customer_statements SECURITY INVOKER;
ALTER FUNCTION get_customers_for_picker SECURITY INVOKER;
ALTER FUNCTION get_invoice_counts_by_type SECURITY INVOKER;
ALTER FUNCTION get_invoices_for_date_range SECURITY INVOKER;
ALTER FUNCTION get_open_invoice_stats SECURITY INVOKER;
ALTER FUNCTION get_payment_breakdown_by_date SECURITY INVOKER;
ALTER FUNCTION get_payment_breakdown_by_month SECURITY INVOKER;
ALTER FUNCTION get_payment_counts_by_type SECURITY INVOKER;
ALTER FUNCTION get_payment_totals_by_type SECURITY INVOKER;
ALTER FUNCTION get_payments_for_analytics SECURITY INVOKER;
ALTER FUNCTION get_payments_with_applications SECURITY INVOKER;
ALTER FUNCTION get_single_customer_timeline SECURITY INVOKER;
ALTER FUNCTION get_status_distribution SECURITY INVOKER;
ALTER FUNCTION get_todays_active_reminders SECURITY INVOKER;
ALTER FUNCTION global_search SECURITY INVOKER;
ALTER FUNCTION search_voided_payments_by_date SECURITY INVOKER;

-- Overloaded functions need explicit signatures
ALTER FUNCTION get_filtered_payment_aggregates(text, integer, text, text, text, text, text[]) SECURITY INVOKER;
ALTER FUNCTION get_filtered_payment_aggregates(text, integer, text, text, text, text, text[], text[]) SECURITY INVOKER;
ALTER FUNCTION get_customer_invoices_count(text) SECURITY INVOKER;
ALTER FUNCTION get_customer_invoices_count(text, text) SECURITY INVOKER;

-- User-triggered update functions
ALTER FUNCTION batch_update_invoice_color_status SECURITY INVOKER;
ALTER FUNCTION batch_update_invoice_color_status_by_refs SECURITY INVOKER;
ALTER FUNCTION update_invoice_color_status SECURITY INVOKER;
ALTER FUNCTION update_invoice_color_status_by_ref SECURITY INVOKER;
ALTER FUNCTION update_customer_contact_status SECURITY INVOKER;
ALTER FUNCTION mark_invoice_touched SECURITY INVOKER;

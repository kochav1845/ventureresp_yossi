/*
  # Change remaining user-facing SECURITY DEFINER functions to INVOKER

  These functions query core tables and should respect org-based RLS.
*/

ALTER FUNCTION get_collector_activity_summary SECURITY INVOKER;
ALTER FUNCTION get_collector_total_collected SECURITY INVOKER;
ALTER FUNCTION get_customer_invoice_payments_total SECURITY INVOKER;
ALTER FUNCTION get_customer_payment_totals_accurate SECURITY INVOKER;
ALTER FUNCTION get_invoice_month_summary SECURITY INVOKER;
ALTER FUNCTION get_invoice_only_payment_total SECURITY INVOKER;
ALTER FUNCTION get_monthly_payment_totals_accurate SECURITY INVOKER;
ALTER FUNCTION get_payment_month_summary SECURITY INVOKER;
ALTER FUNCTION get_payment_stats_transaction_accurate SECURITY INVOKER;
ALTER FUNCTION get_payment_totals_by_date_range SECURITY INVOKER;
ALTER FUNCTION get_status_changes_over_time SECURITY INVOKER;
ALTER FUNCTION get_ticket_merge_history SECURITY INVOKER;
ALTER FUNCTION get_user_status_change_stats SECURITY INVOKER;
ALTER FUNCTION get_incomplete_voided_pairs_summary SECURITY INVOKER;
ALTER FUNCTION get_enrichment_stats SECURITY INVOKER;
ALTER FUNCTION search_emails SECURITY INVOKER;
ALTER FUNCTION get_available_collectors SECURITY INVOKER;
ALTER FUNCTION get_active_ticket_statuses SECURITY INVOKER;

/*
  # Fix Admin Dashboard to Show Sync Errors

  1. Updates
    - Update `get_admin_dashboard_metrics()` to pull errors from sync_status table
    - Show recent sync failures and error messages
    - Display system health based on sync status

  2. Metrics
    - Total sync failures in last sync run
    - Failed entity types with error details
    - Overall sync health status
*/

CREATE OR REPLACE FUNCTION get_admin_dashboard_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  twelve_months_ago TIMESTAMP;
  today_start TIMESTAMP;
  seven_days_ago TIMESTAMP;
  thirty_days_ago TIMESTAMP;
  twenty_four_hours_ago TIMESTAMP;
BEGIN
  -- Calculate date ranges
  twelve_months_ago := CURRENT_DATE - INTERVAL '12 months';
  today_start := CURRENT_DATE;
  seven_days_ago := CURRENT_TIMESTAMP - INTERVAL '7 days';
  thirty_days_ago := CURRENT_TIMESTAMP - INTERVAL '30 days';
  twenty_four_hours_ago := CURRENT_TIMESTAMP - INTERVAL '24 hours';

  WITH
  -- Collector metrics
  collector_stats AS (
    SELECT
      COUNT(DISTINCT id) as total_collectors,
      COUNT(DISTINCT CASE 
        WHEN EXISTS (
          SELECT 1 FROM user_activity_logs ual 
          WHERE ual.user_id = up.id 
          AND ual.created_at >= seven_days_ago
        ) THEN id 
      END) as active_collectors
    FROM user_profiles up
    WHERE role = 'collector'
  ),
  ticket_stats AS (
    SELECT COUNT(*) as total_tickets
    FROM collection_tickets
  ),
  -- Revenue metrics (12 months)
  revenue_stats AS (
    SELECT
      COALESCE(SUM(CAST(payment_amount AS NUMERIC)), 0) as total_revenue,
      COUNT(*) as payments_count,
      COALESCE(AVG(CAST(payment_amount AS NUMERIC)), 0) as average_payment
    FROM acumatica_payments
    WHERE application_date >= twelve_months_ago
    AND payment_amount IS NOT NULL
  ),
  -- Customer metrics
  customer_stats AS (
    SELECT
      COUNT(*) as total_customers,
      COUNT(*) FILTER (WHERE customer_status = 'Active') as active_customers
    FROM acumatica_customers
  ),
  outstanding_balance AS (
    SELECT COALESCE(SUM(CAST(balance AS NUMERIC)), 0) as total_balance
    FROM acumatica_invoices
    WHERE status = 'Open'
  ),
  -- Invoice metrics
  invoice_stats AS (
    SELECT
      COUNT(*) as total_invoices,
      COUNT(*) FILTER (WHERE status = 'Open') as open_invoices,
      COUNT(*) FILTER (WHERE status IN ('Closed', 'Paid Off')) as paid_invoices
    FROM acumatica_invoices
  ),
  -- Payment metrics
  payment_stats AS (
    SELECT
      COUNT(*) as total_payments,
      COALESCE(SUM(CAST(payment_amount AS NUMERIC)), 0) as total_amount
    FROM acumatica_payments
  ),
  payment_apps AS (
    SELECT COUNT(DISTINCT payment_id) as with_applications
    FROM payment_invoice_applications
    WHERE payment_id IS NOT NULL
  ),
  -- User activity
  user_stats AS (
    SELECT COUNT(*) as total_users
    FROM user_profiles
  ),
  active_today AS (
    SELECT COUNT(DISTINCT user_id) as active_today
    FROM user_activity_logs
    WHERE created_at >= today_start
  ),
  login_stats AS (
    SELECT COUNT(*) as total_logins
    FROM user_activity_logs
    WHERE action_type = 'login'
    AND created_at >= thirty_days_ago
  ),
  -- Email metrics
  email_stats AS (
    SELECT
      0 as total_sent,
      0 as census_emails,
      0 as report_emails
  ),
  -- Stripe metrics
  stripe_stats AS (
    SELECT
      COUNT(*) as total_payments,
      COUNT(*) FILTER (WHERE status = 'succeeded') as successful,
      COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as revenue
    FROM stripe_payment_intents
  ),
  -- Sync Status Errors (Using actual sync_status table)
  sync_failures AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed' OR last_error IS NOT NULL) as total_failures,
      jsonb_agg(
        jsonb_build_object(
          'job_name', entity_type,
          'error_message', COALESCE(last_error, 'Unknown error'),
          'executed_at', updated_at
        ) ORDER BY updated_at DESC
      ) FILTER (WHERE status = 'failed' OR last_error IS NOT NULL) as failed_jobs
    FROM sync_status
    WHERE updated_at >= twenty_four_hours_ago
  ),
  sync_health AS (
    SELECT
      COUNT(*) as total_executions,
      COUNT(*) FILTER (WHERE status = 'completed' AND last_error IS NULL) as successful_executions,
      CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(*) FILTER (WHERE status = 'completed' AND last_error IS NULL)::NUMERIC / COUNT(*) * 100), 2)
        ELSE 100
      END as success_rate
    FROM sync_status
    WHERE updated_at >= twenty_four_hours_ago
  )

  SELECT json_build_object(
    'collectorPerformance', json_build_object(
      'totalCollectors', COALESCE((SELECT total_collectors FROM collector_stats), 0),
      'activeCollectors', COALESCE((SELECT active_collectors FROM collector_stats), 0),
      'totalTickets', COALESCE((SELECT total_tickets FROM ticket_stats), 0)
    ),
    'revenue', json_build_object(
      'totalRevenue', COALESCE((SELECT total_revenue FROM revenue_stats), 0),
      'paymentsCount', COALESCE((SELECT payments_count FROM revenue_stats), 0),
      'averagePayment', COALESCE((SELECT average_payment FROM revenue_stats), 0)
    ),
    'customers', json_build_object(
      'totalCustomers', COALESCE((SELECT total_customers FROM customer_stats), 0),
      'activeCustomers', COALESCE((SELECT active_customers FROM customer_stats), 0),
      'outstandingBalance', COALESCE((SELECT total_balance FROM outstanding_balance), 0)
    ),
    'invoices', json_build_object(
      'totalInvoices', COALESCE((SELECT total_invoices FROM invoice_stats), 0),
      'openInvoices', COALESCE((SELECT open_invoices FROM invoice_stats), 0),
      'paidInvoices', COALESCE((SELECT paid_invoices FROM invoice_stats), 0)
    ),
    'payments', json_build_object(
      'totalPayments', COALESCE((SELECT total_payments FROM payment_stats), 0),
      'totalAmount', COALESCE((SELECT total_amount FROM payment_stats), 0),
      'withApplications', COALESCE((SELECT with_applications FROM payment_apps), 0)
    ),
    'userActivity', json_build_object(
      'totalUsers', COALESCE((SELECT total_users FROM user_stats), 0),
      'activeToday', COALESCE((SELECT active_today FROM active_today), 0),
      'totalLogins', COALESCE((SELECT total_logins FROM login_stats), 0)
    ),
    'emails', json_build_object(
      'totalSent', COALESCE((SELECT total_sent FROM email_stats), 0),
      'censusEmails', COALESCE((SELECT census_emails FROM email_stats), 0),
      'reportEmails', COALESCE((SELECT report_emails FROM email_stats), 0)
    ),
    'stripe', json_build_object(
      'totalPayments', COALESCE((SELECT total_payments FROM stripe_stats), 0),
      'successful', COALESCE((SELECT successful FROM stripe_stats), 0),
      'revenue', COALESCE((SELECT revenue FROM stripe_stats), 0)
    ),
    'cronJobs', json_build_object(
      'totalFailures', COALESCE((SELECT total_failures FROM sync_failures), 0),
      'failedJobs', COALESCE((SELECT failed_jobs FROM sync_failures), '[]'::jsonb),
      'totalExecutions', COALESCE((SELECT total_executions FROM sync_health), 0),
      'successfulExecutions', COALESCE((SELECT successful_executions FROM sync_health), 0),
      'successRate', COALESCE((SELECT success_rate FROM sync_health), 100),
      'hasErrors', COALESCE((SELECT total_failures FROM sync_failures), 0) > 0
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_admin_dashboard_metrics() TO authenticated;

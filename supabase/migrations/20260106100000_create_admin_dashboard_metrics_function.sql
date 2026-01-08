/*
  # Admin Dashboard Metrics Function

  1. Purpose
    - Compute all admin dashboard metrics in a single database call
    - Significantly improve dashboard load performance
    - Reduce network overhead and round trips

  2. Metrics Included
    - Collector performance (total, active, tickets)
    - Revenue metrics (total, count, average)
    - Customer metrics (total, active, outstanding balance)
    - Invoice metrics (total, open, paid)
    - Payment metrics (total, amount, with applications)
    - User activity (total users, active today, logins)
    - Email metrics (total sent, census, reports)
    - Stripe metrics (total payments, successful, revenue)

  3. Performance
    - Uses efficient aggregations
    - Executes as single transaction
    - Returns JSON object with all metrics
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
BEGIN
  -- Calculate date ranges
  twelve_months_ago := CURRENT_DATE - INTERVAL '12 months';
  today_start := CURRENT_DATE;
  seven_days_ago := CURRENT_TIMESTAMP - INTERVAL '7 days';
  thirty_days_ago := CURRENT_TIMESTAMP - INTERVAL '30 days';

  WITH
  -- Collector metrics
  collector_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE role = 'collector') as total_collectors,
      COUNT(DISTINCT ual.user_id) FILTER (
        WHERE ual.action_type = 'invoice_color_change'
        AND ual.created_at >= seven_days_ago
      ) as active_collectors
    FROM user_profiles up
    LEFT JOIN user_activity_logs ual ON up.id = ual.user_id AND ual.created_at >= seven_days_ago
  ),
  ticket_stats AS (
    SELECT COUNT(*) as total_tickets
    FROM collection_tickets
  ),
  -- Revenue metrics
  revenue_stats AS (
    SELECT
      COALESCE(SUM(payment_amount::numeric), 0) as total_revenue,
      COUNT(*) as payments_count,
      CASE
        WHEN COUNT(*) > 0 THEN COALESCE(SUM(payment_amount::numeric), 0) / COUNT(*)
        ELSE 0
      END as average_payment
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
  invoice_balance AS (
    SELECT COALESCE(SUM(balance::numeric), 0) as outstanding_balance
    FROM acumatica_invoices
    WHERE status = 'Open' AND balance IS NOT NULL
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
      COALESCE(SUM(payment_amount::numeric), 0) as total_amount
    FROM acumatica_payments
    WHERE payment_amount IS NOT NULL
  ),
  payment_app_stats AS (
    SELECT COUNT(DISTINCT payment_id) as with_applications
    FROM payment_invoice_applications
    WHERE payment_id IS NOT NULL
  ),
  -- User activity metrics
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
  -- Email metrics (using scheduler_logs as proxy)
  email_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'success') as total_sent,
      COUNT(*) FILTER (WHERE job_name LIKE '%census%') as census_emails,
      COUNT(*) FILTER (WHERE job_name LIKE '%report%') as report_emails
    FROM scheduler_logs
    WHERE job_name LIKE '%email%'
  ),
  -- Stripe metrics
  stripe_stats AS (
    SELECT
      COUNT(*) as total_payments,
      COUNT(*) FILTER (WHERE status = 'succeeded') as successful,
      COALESCE(SUM(amount::numeric / 100), 0) as revenue
    FROM stripe_payment_intents
  )
  -- Build final JSON
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
      'outstandingBalance', COALESCE((SELECT outstanding_balance FROM invoice_balance), 0)
    ),
    'invoices', json_build_object(
      'totalInvoices', COALESCE((SELECT total_invoices FROM invoice_stats), 0),
      'openInvoices', COALESCE((SELECT open_invoices FROM invoice_stats), 0),
      'paidInvoices', COALESCE((SELECT paid_invoices FROM invoice_stats), 0)
    ),
    'payments', json_build_object(
      'totalPayments', COALESCE((SELECT total_payments FROM payment_stats), 0),
      'totalAmount', COALESCE((SELECT total_amount FROM payment_stats), 0),
      'withApplications', COALESCE((SELECT with_applications FROM payment_app_stats), 0)
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
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_admin_dashboard_metrics() TO authenticated;
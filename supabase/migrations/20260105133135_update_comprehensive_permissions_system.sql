/*
  # Update Comprehensive Permissions System

  1. New Features Added
    - Collection Ticketing System
    - Collector Management (Control Panel, Monitoring, Performance)
    - Advanced Analytics (Revenue, Customer, User Activity, Email, Stripe)
    - User Approval System
    - Activity Logging
    - My Assignments View
    - Diagnostic Tools

  2. Permission Structure Refinements
    - Analytics: VIEW ONLY (removed create/edit/delete as they're read-only)
    - Logs & Monitoring: VIEW ONLY
    - Acumatica Data: VIEW ONLY (data comes from external system)
    - System Administration: Proper granularity
    - Collection System: Full CRUD for appropriate roles

  3. Role Updates
    - Admin: Full access to all features
    - Manager: Access to management, analytics, and operations
    - Collector: Access to assigned customers, ticketing, and collection tools
    - Viewer: Read-only access to basic data
    - Secretary: Administrative support with limited edit capabilities

  4. Security
    - All permissions maintain RLS
    - Appropriate access levels per role
*/

-- Add new system permissions for missing features
INSERT INTO system_permissions (permission_key, permission_name, category, description) VALUES
  -- Collection Management
  ('collection_ticketing', 'Collection Ticketing', 'Collection Management', 'Manage collection tickets and follow-ups'),
  ('my_assignments', 'My Assignments', 'Collection Management', 'View assigned customers and tickets'),
  ('collector_control_panel', 'Collector Control Panel', 'Collection Management', 'Control panel for collector operations'),

  -- Advanced Analytics
  ('analytics_revenue', 'Revenue Analytics', 'Advanced Analytics', 'View revenue trends and payment analytics'),
  ('analytics_customer', 'Customer Analytics', 'Advanced Analytics', 'View customer behavior and payment patterns'),
  ('analytics_collector_performance', 'Collector Performance Analytics', 'Advanced Analytics', 'View collector performance metrics'),
  ('analytics_user_activity', 'User Activity Analytics', 'Advanced Analytics', 'View user activity and engagement metrics'),
  ('analytics_email', 'Email Analytics', 'Advanced Analytics', 'View email campaign and delivery analytics'),
  ('analytics_stripe', 'Stripe Analytics', 'Advanced Analytics', 'View Stripe payment processing analytics'),
  ('analytics_comprehensive', 'Comprehensive Dashboard', 'Advanced Analytics', 'Access to unified analytics dashboard'),

  -- Collector Management
  ('collector_monitoring', 'Collector Monitoring', 'Collector Management', 'Monitor collector activity and performance'),

  -- User Management
  ('users_approval', 'User Approval', 'User Management', 'Approve or reject pending user registrations'),
  ('users_activity_log', 'User Activity Log', 'User Management', 'View detailed user activity logs'),
  ('users_impersonation', 'User Impersonation', 'User Management', 'Impersonate other users for support'),

  -- Stripe System
  ('stripe_payments', 'Stripe Payments', 'Stripe System', 'View and manage Stripe payment portal'),
  ('stripe_webhooks', 'Stripe Webhooks', 'Stripe System', 'View and diagnose Stripe webhook events'),

  -- Diagnostic Tools (Admin only)
  ('diagnostics_payment_applications', 'Payment Application Diagnostics', 'Diagnostic Tools', 'Diagnose payment application issues'),
  ('diagnostics_invoice_formats', 'Invoice Format Checker', 'Diagnostic Tools', 'Check invoice data format consistency'),
  ('diagnostics_sync_status', 'Sync Diagnostics', 'Diagnostic Tools', 'Diagnose synchronization issues'),
  ('diagnostics_orphaned_data', 'Orphaned Data Diagnostics', 'Diagnostic Tools', 'Find and fix orphaned records')
ON CONFLICT (permission_key) DO NOTHING;

-- Update existing permissions descriptions for clarity
UPDATE system_permissions SET
  description = 'Access unified analytics dashboard with key metrics'
WHERE permission_key = 'analytics_comprehensive';

-- Delete old role permissions to rebuild them properly
DELETE FROM role_permissions WHERE role IN ('admin', 'manager', 'collector', 'viewer', 'secretary');

-- ==========================================
-- ADMIN ROLE - Full Access to Everything
-- ==========================================
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard & Analytics (VIEW ONLY - analytics are calculated, not editable)
  ('admin', 'dashboard_main', true, false, false, false),
  ('admin', 'analytics_invoices', true, false, false, false),
  ('admin', 'analytics_payments', true, false, false, false),
  ('admin', 'analytics_invoice_status', true, false, false, false),
  ('admin', 'analytics_dashboard', true, false, false, false),
  ('admin', 'analytics_revenue', true, false, false, false),
  ('admin', 'analytics_customer', true, false, false, false),
  ('admin', 'analytics_collector_performance', true, false, false, false),
  ('admin', 'analytics_user_activity', true, false, false, false),
  ('admin', 'analytics_email', true, false, false, false),
  ('admin', 'analytics_stripe', true, false, false, false),
  ('admin', 'analytics_comprehensive', true, false, false, false),

  -- Customer Management
  ('admin', 'customers_view', true, false, true, false),
  ('admin', 'customers_edit', true, false, true, false),
  ('admin', 'customers_assignments', true, true, true, true),
  ('admin', 'customers_files', true, true, true, true),
  ('admin', 'customers_reports', true, true, false, false),
  ('admin', 'customers_dashboard', true, false, false, false),

  -- Invoice Management (VIEW and STATUS CONTROL - invoices sync from Acumatica)
  ('admin', 'invoices_view', true, false, false, false),
  ('admin', 'invoices_edit', true, false, false, false),
  ('admin', 'invoices_status', true, false, true, false),
  ('admin', 'invoices_memos', true, true, true, true),
  ('admin', 'invoices_reminders', true, true, true, true),
  ('admin', 'invoices_acumatica', true, false, false, false),

  -- Payment Management (VIEW ONLY - payments sync from Acumatica)
  ('admin', 'payments_view', true, false, false, false),
  ('admin', 'payments_edit', true, false, false, false),
  ('admin', 'payments_applications', true, false, false, false),
  ('admin', 'payments_check_images', true, false, false, false),
  ('admin', 'payments_acumatica', true, false, false, false),

  -- Email System
  ('admin', 'email_inbox', true, false, false, false),
  ('admin', 'email_send', true, true, false, false),
  ('admin', 'email_reply', true, true, false, false),
  ('admin', 'email_templates', true, true, true, true),
  ('admin', 'email_formulas', true, true, true, true),
  ('admin', 'email_logs', true, false, false, false),

  -- Reports & Documents (Reports are generated, not edited)
  ('admin', 'reports_monthly', true, true, false, false),
  ('admin', 'reports_custom', true, true, false, false),
  ('admin', 'documents_view', true, false, false, false),

  -- Reminders System
  ('admin', 'reminders_view', true, false, false, false),
  ('admin', 'reminders_create', true, true, false, false),
  ('admin', 'reminders_edit', true, false, true, false),
  ('admin', 'reminders_delete', true, false, false, true),

  -- Collection Management
  ('admin', 'collection_ticketing', true, true, true, true),
  ('admin', 'my_assignments', true, false, false, false),
  ('admin', 'collector_control_panel', true, true, true, true),
  ('admin', 'collector_monitoring', true, false, false, false),

  -- System Administration
  ('admin', 'admin_dashboard', true, false, false, false),
  ('admin', 'admin_users', true, true, true, true),
  ('admin', 'admin_roles', true, true, true, true),
  ('admin', 'admin_sync_config', true, true, true, false),
  ('admin', 'admin_webhook_config', true, true, true, false),
  ('admin', 'admin_system_docs', true, false, false, false),

  -- User Management
  ('admin', 'users_approval', true, true, false, false),
  ('admin', 'users_activity_log', true, false, false, false),
  ('admin', 'users_impersonation', true, false, false, false),

  -- Acumatica Integration (VIEW ONLY - data comes from external system)
  ('admin', 'acumatica_customers', true, false, false, false),
  ('admin', 'acumatica_sync', true, true, false, false),
  ('admin', 'acumatica_test', true, true, false, false),
  ('admin', 'acumatica_credentials', true, true, true, false),

  -- Stripe System
  ('admin', 'stripe_payments', true, false, false, false),
  ('admin', 'stripe_webhooks', true, false, false, false),

  -- Monitoring & Logs (VIEW ONLY - logs are system generated)
  ('admin', 'logs_scheduler', true, false, false, false),
  ('admin', 'logs_sync', true, false, false, false),
  ('admin', 'logs_webhook', true, false, false, false),
  ('admin', 'monitor_cron', true, false, false, false),
  ('admin', 'monitor_sync_status', true, false, false, false),

  -- Diagnostic Tools (VIEW ONLY - for troubleshooting)
  ('admin', 'diagnostics_payment_applications', true, false, false, false),
  ('admin', 'diagnostics_invoice_formats', true, false, false, false),
  ('admin', 'diagnostics_sync_status', true, false, false, false),
  ('admin', 'diagnostics_orphaned_data', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- ==========================================
-- MANAGER ROLE - Operations & Analytics
-- ==========================================
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard & Analytics (VIEW ONLY)
  ('manager', 'dashboard_main', true, false, false, false),
  ('manager', 'analytics_invoices', true, false, false, false),
  ('manager', 'analytics_payments', true, false, false, false),
  ('manager', 'analytics_invoice_status', true, false, false, false),
  ('manager', 'analytics_dashboard', true, false, false, false),
  ('manager', 'analytics_revenue', true, false, false, false),
  ('manager', 'analytics_customer', true, false, false, false),
  ('manager', 'analytics_collector_performance', true, false, false, false),
  ('manager', 'analytics_user_activity', true, false, false, false),
  ('manager', 'analytics_email', true, false, false, false),
  ('manager', 'analytics_stripe', true, false, false, false),
  ('manager', 'analytics_comprehensive', true, false, false, false),

  -- Customer Management (View and Edit)
  ('manager', 'customers_view', true, false, true, false),
  ('manager', 'customers_edit', true, false, true, false),
  ('manager', 'customers_assignments', true, true, true, false),
  ('manager', 'customers_files', true, true, false, false),
  ('manager', 'customers_reports', true, true, false, false),
  ('manager', 'customers_dashboard', true, false, false, false),

  -- Invoice Management
  ('manager', 'invoices_view', true, false, false, false),
  ('manager', 'invoices_edit', true, false, false, false),
  ('manager', 'invoices_status', true, false, true, false),
  ('manager', 'invoices_memos', true, true, true, true),
  ('manager', 'invoices_reminders', true, true, true, true),
  ('manager', 'invoices_acumatica', true, false, false, false),

  -- Payment Management (VIEW ONLY)
  ('manager', 'payments_view', true, false, false, false),
  ('manager', 'payments_edit', true, false, false, false),
  ('manager', 'payments_applications', true, false, false, false),
  ('manager', 'payments_check_images', true, false, false, false),
  ('manager', 'payments_acumatica', true, false, false, false),

  -- Email System
  ('manager', 'email_inbox', true, false, false, false),
  ('manager', 'email_send', true, true, false, false),
  ('manager', 'email_reply', true, true, false, false),
  ('manager', 'email_templates', true, true, true, true),
  ('manager', 'email_formulas', true, true, true, true),
  ('manager', 'email_logs', true, false, false, false),

  -- Reports
  ('manager', 'reports_monthly', true, true, false, false),
  ('manager', 'reports_custom', true, true, false, false),
  ('manager', 'documents_view', true, false, false, false),

  -- Reminders System
  ('manager', 'reminders_view', true, false, false, false),
  ('manager', 'reminders_create', true, true, false, false),
  ('manager', 'reminders_edit', true, false, true, false),
  ('manager', 'reminders_delete', true, false, false, true),

  -- Collection Management
  ('manager', 'collection_ticketing', true, true, true, true),
  ('manager', 'my_assignments', true, false, false, false),
  ('manager', 'collector_control_panel', true, true, true, false),
  ('manager', 'collector_monitoring', true, false, false, false),

  -- User Management (Limited)
  ('manager', 'users_activity_log', true, false, false, false),

  -- Stripe System
  ('manager', 'stripe_payments', true, false, false, false),
  ('manager', 'stripe_webhooks', true, false, false, false),

  -- Monitoring (VIEW ONLY)
  ('manager', 'logs_scheduler', true, false, false, false),
  ('manager', 'logs_sync', true, false, false, false),
  ('manager', 'logs_webhook', true, false, false, false),
  ('manager', 'monitor_sync_status', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- ==========================================
-- COLLECTOR ROLE - Collection Operations
-- ==========================================
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard (Basic View)
  ('collector', 'dashboard_main', true, false, false, false),
  ('collector', 'analytics_comprehensive', true, false, false, false),

  -- Customer Management (Limited to Assignments)
  ('collector', 'customers_view', true, false, false, false),
  ('collector', 'customers_files', true, true, false, false),
  ('collector', 'customers_dashboard', true, false, false, false),

  -- Invoice Management (View and Status)
  ('collector', 'invoices_view', true, false, false, false),
  ('collector', 'invoices_status', true, false, true, false),
  ('collector', 'invoices_memos', true, true, true, false),
  ('collector', 'invoices_reminders', true, true, true, false),

  -- Payment Management (VIEW ONLY)
  ('collector', 'payments_view', true, false, false, false),
  ('collector', 'payments_applications', true, false, false, false),
  ('collector', 'payments_check_images', true, false, false, false),

  -- Email System
  ('collector', 'email_inbox', true, false, false, false),
  ('collector', 'email_send', true, true, false, false),
  ('collector', 'email_reply', true, true, false, false),
  ('collector', 'email_logs', true, false, false, false),

  -- Reminders (Own Only)
  ('collector', 'reminders_view', true, false, false, false),
  ('collector', 'reminders_create', true, true, false, false),
  ('collector', 'reminders_edit', true, false, true, false),
  ('collector', 'reminders_delete', true, false, false, true),

  -- Collection Management (Primary Role)
  ('collector', 'collection_ticketing', true, true, true, false),
  ('collector', 'my_assignments', true, false, false, false),
  ('collector', 'collector_control_panel', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- ==========================================
-- SECRETARY ROLE - Administrative Support
-- ==========================================
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard
  ('secretary', 'dashboard_main', true, false, false, false),
  ('secretary', 'analytics_comprehensive', true, false, false, false),

  -- Customer Management (View and Files)
  ('secretary', 'customers_view', true, false, false, false),
  ('secretary', 'customers_files', true, true, true, false),
  ('secretary', 'customers_reports', true, true, false, false),
  ('secretary', 'customers_dashboard', true, false, false, false),

  -- Invoice Management (View and Memos)
  ('secretary', 'invoices_view', true, false, false, false),
  ('secretary', 'invoices_memos', true, true, true, false),

  -- Payment Management (VIEW ONLY)
  ('secretary', 'payments_view', true, false, false, false),
  ('secretary', 'payments_applications', true, false, false, false),
  ('secretary', 'payments_check_images', true, false, false, false),

  -- Email System
  ('secretary', 'email_inbox', true, false, false, false),
  ('secretary', 'email_send', true, true, false, false),
  ('secretary', 'email_reply', true, true, false, false),
  ('secretary', 'email_templates', true, false, false, false),

  -- Reports
  ('secretary', 'reports_monthly', true, true, false, false),
  ('secretary', 'documents_view', true, false, false, false),

  -- Reminders
  ('secretary', 'reminders_view', true, false, false, false),
  ('secretary', 'reminders_create', true, true, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- ==========================================
-- VIEWER ROLE - Read-Only Access
-- ==========================================
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard & Analytics (VIEW ONLY)
  ('viewer', 'dashboard_main', true, false, false, false),
  ('viewer', 'analytics_invoices', true, false, false, false),
  ('viewer', 'analytics_payments', true, false, false, false),
  ('viewer', 'analytics_comprehensive', true, false, false, false),

  -- Customer Management (VIEW ONLY)
  ('viewer', 'customers_view', true, false, false, false),
  ('viewer', 'customers_files', true, false, false, false),
  ('viewer', 'customers_dashboard', true, false, false, false),

  -- Invoice Management (VIEW ONLY)
  ('viewer', 'invoices_view', true, false, false, false),
  ('viewer', 'invoices_memos', true, false, false, false),

  -- Payment Management (VIEW ONLY)
  ('viewer', 'payments_view', true, false, false, false),
  ('viewer', 'payments_applications', true, false, false, false),
  ('viewer', 'payments_check_images', true, false, false, false),

  -- Email System (VIEW ONLY)
  ('viewer', 'email_inbox', true, false, false, false),

  -- Reports (VIEW ONLY)
  ('viewer', 'reports_monthly', true, false, false, false),
  ('viewer', 'documents_view', true, false, false, false),

  -- Reminders (VIEW ONLY)
  ('viewer', 'reminders_view', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Create a summary view for easy permission checking
CREATE OR REPLACE VIEW user_permissions_summary AS
SELECT
  up.id as user_id,
  up.email,
  up.full_name,
  up.role,
  sp.permission_key,
  sp.permission_name,
  sp.category,
  COALESCE(ucp.can_view, rp.can_view, false) as can_view,
  COALESCE(ucp.can_create, rp.can_create, false) as can_create,
  COALESCE(ucp.can_edit, rp.can_edit, false) as can_edit,
  COALESCE(ucp.can_delete, rp.can_delete, false) as can_delete,
  (ucp.user_id IS NOT NULL) as has_custom_override
FROM user_profiles up
CROSS JOIN system_permissions sp
LEFT JOIN role_permissions rp ON rp.role = up.role AND rp.permission_key = sp.permission_key
LEFT JOIN user_custom_permissions ucp ON ucp.user_id = up.id AND ucp.permission_key = sp.permission_key
WHERE up.role IS NOT NULL;

COMMENT ON VIEW user_permissions_summary IS 'Comprehensive view of all user permissions including role-based and custom overrides';
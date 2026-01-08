/*
  # Consolidate Permission System - Reduce from 74 to 21 Permissions
  
  ## Changes
  This migration consolidates the overly granular permission system into a cleaner structure.
  
  **Before:** 74 separate permissions (e.g., "View Customers", "Edit Customers", "Customer Files")
  **After:** 21 core permissions (e.g., "Customers" with View/Create/Edit/Delete checkboxes)
  
  ## New Permission Structure (21 Total)
  
  ### Dashboard & Analytics (3)
  1. dashboard_main - Main Dashboard
  2. analytics_basic - Invoice, Payment, Invoice Status Analytics
  3. analytics_advanced - Revenue, Customer, Collector, Email, Stripe Analytics
  
  ### Core Operations (4)
  4. customers - All customer management
  5. invoices - All invoice operations
  6. payments - All payment operations
  7. emails - Email system (inbox, send, reply, templates, formulas)
  
  ### Features (3)
  8. reminders - Reminder management
  9. my_assignments - View own assignments
  10. collection_ticketing - Collection workflow
  
  ### Reports & Integrations (3)
  11. reports - Reports and documentation
  12. stripe - Stripe payment portal
  13. monitoring - Logs and system monitoring
  
  ### Administration (6)
  14. admin_users - User management
  15. admin_roles - Role management
  16. admin_sync_config - Sync configuration
  17. admin_webhooks - Webhook configuration
  18. admin_collector_control - Collector management
  19. admin_dashboard - Admin dashboard access
  
  ### Technical (2)
  20. acumatica - Acumatica integration
  21. diagnostics - Diagnostic tools
  
  ## Migration Strategy
  1. Backup existing custom permissions
  2. Delete old system_permissions
  3. Insert new consolidated permissions
  4. Migrate user_custom_permissions to new keys
  5. Update role_permissions to new keys
*/

-- Step 1: Create backup tables
CREATE TEMP TABLE backup_user_custom_permissions AS 
SELECT * FROM user_custom_permissions;

CREATE TEMP TABLE backup_role_permissions AS 
SELECT * FROM role_permissions;

-- Step 2: Clear existing tables
DELETE FROM user_custom_permissions;
DELETE FROM role_permissions;
DELETE FROM system_permissions;

-- Step 3: Insert new consolidated system permissions
INSERT INTO system_permissions (permission_key, permission_name, category, description) VALUES

-- Dashboard & Analytics (3)
('dashboard_main', 'Main Dashboard', 'Dashboard & Analytics', 'Access main dashboard overview'),
('analytics_basic', 'Basic Analytics', 'Dashboard & Analytics', 'Access invoice, payment, and invoice status analytics'),
('analytics_advanced', 'Advanced Analytics', 'Dashboard & Analytics', 'Access revenue, customer, collector performance, email, and Stripe analytics'),

-- Core Operations (4)
('customers', 'Customers', 'Customer Management', 'Manage customers, files, assignments, and reports'),
('invoices', 'Invoices', 'Invoice Management', 'Manage invoices, status, memos, and reminders'),
('payments', 'Payments', 'Payment Management', 'Manage payments, applications, and check images'),
('emails', 'Email System', 'Communication', 'Access inbox, send emails, manage templates and formulas'),

-- Features (3)
('reminders', 'Reminders', 'Task Management', 'Create and manage reminders'),
('my_assignments', 'My Assignments', 'Collection Management', 'View assigned customers and tickets'),
('collection_ticketing', 'Collection Ticketing', 'Collection Management', 'Manage collection tickets and follow-ups'),

-- Reports & Integrations (3)
('reports', 'Reports & Documents', 'Reports', 'View and generate reports, access documentation'),
('stripe', 'Stripe Payments', 'Payment Processing', 'Access Stripe payment portal and webhooks'),
('monitoring', 'System Monitoring', 'Monitoring & Logs', 'View system logs, sync status, and monitoring'),

-- Administration (6)
('admin_users', 'User Management', 'System Administration', 'Manage users, approvals, activity logs, and impersonation'),
('admin_roles', 'Role Management', 'System Administration', 'Manage roles and role permissions'),
('admin_sync_config', 'Sync Configuration', 'System Administration', 'Configure Acumatica synchronization'),
('admin_webhooks', 'Webhook Configuration', 'System Administration', 'Configure and manage webhooks'),
('admin_collector_control', 'Collector Management', 'System Administration', 'Control panel for collector operations and monitoring'),
('admin_dashboard', 'Admin Dashboard', 'System Administration', 'Access administrative dashboard'),

-- Technical (2)
('acumatica', 'Acumatica Integration', 'Acumatica Integration', 'Access Acumatica data and trigger syncs'),
('diagnostics', 'Diagnostic Tools', 'System Administration', 'Access diagnostic and troubleshooting tools');

-- Step 4: Set up default role permissions

-- Admin: Full access to everything
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 'admin', permission_key, true, true, true, true
FROM system_permissions;

-- Manager: Most access except sensitive admin features
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 'manager', permission_key,
  true, -- can_view: all
  CASE 
    WHEN permission_key IN ('admin_users', 'admin_roles', 'admin_webhooks', 'diagnostics') THEN false
    ELSE true
  END, -- can_create: most except user/role admin
  CASE 
    WHEN permission_key IN ('admin_users', 'admin_roles', 'admin_webhooks', 'diagnostics') THEN false
    ELSE true
  END, -- can_edit: most except user/role admin
  CASE 
    WHEN permission_key LIKE 'admin_%' OR permission_key IN ('diagnostics', 'acumatica') THEN false
    ELSE true
  END -- can_delete: no admin functions
FROM system_permissions;

-- Collector: Customer/invoice/payment operations + own assignments
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
VALUES
('collector', 'dashboard_main', true, false, false, false),
('collector', 'analytics_basic', true, false, false, false),
('collector', 'customers', true, false, true, false), -- can edit customers
('collector', 'invoices', true, false, true, false), -- can edit invoices (status, memos)
('collector', 'payments', true, false, false, false), -- can view payments
('collector', 'emails', true, true, true, false), -- can send and reply to emails
('collector', 'reminders', true, true, true, true), -- full reminder access
('collector', 'my_assignments', true, false, true, false), -- can view and update assignments
('collector', 'collection_ticketing', true, true, true, false), -- can create and manage tickets
('collector', 'reports', true, true, false, false); -- can view and generate reports

-- Secretary: Similar to collector but more limited
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
VALUES
('secretary', 'dashboard_main', true, false, false, false),
('secretary', 'customers', true, false, true, false), -- can edit customers
('secretary', 'invoices', true, false, true, false), -- can edit invoices
('secretary', 'payments', true, false, false, false), -- can view payments
('secretary', 'emails', true, true, true, false), -- can send emails
('secretary', 'reminders', true, true, true, true), -- full reminder access
('secretary', 'my_assignments', true, false, false, false), -- can only view assignments
('secretary', 'reports', true, true, false, false); -- can view and generate reports

-- Viewer: Read-only access
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 'viewer', permission_key, 
  CASE 
    WHEN permission_key LIKE 'admin_%' THEN false
    WHEN permission_key IN ('diagnostics', 'acumatica') THEN false
    ELSE true
  END,
  false, false, false
FROM system_permissions
WHERE permission_key NOT LIKE 'admin_%' 
  AND permission_key NOT IN ('diagnostics', 'acumatica');

-- Customer: Only their own data
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
VALUES
('customer', 'invoices', true, false, false, false),
('customer', 'payments', true, true, false, false), -- can make payments via Stripe
('customer', 'stripe', true, true, false, false);

-- Step 5: Migrate existing user custom permissions to new keys
-- This creates a mapping from old permission keys to new ones

-- Customers: customers_view, customers_edit, customers_files, customers_assignments, customers_reports, customers_dashboard
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'customers' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('customers_view', 'customers_edit', 'customers_files', 'customers_assignments', 'customers_reports', 'customers_dashboard')
GROUP BY user_id;

-- Invoices: invoices_view, invoices_edit, invoices_memos, invoices_status, invoices_acumatica
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'invoices' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('invoices_view', 'invoices_edit', 'invoices_memos', 'invoices_status', 'invoices_acumatica')
GROUP BY user_id;

-- Payments: payments_view, payments_edit, payments_applications, payments_check_images, payments_acumatica
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'payments' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('payments_view', 'payments_edit', 'payments_applications', 'payments_check_images', 'payments_acumatica')
GROUP BY user_id;

-- Emails: email_inbox, email_send, email_reply, email_templates, email_formulas
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'emails' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('email_inbox', 'email_send', 'email_reply', 'email_templates', 'email_formulas')
GROUP BY user_id;

-- Reminders: reminders_view, reminders_create, reminders_edit, reminders_delete
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'reminders' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('reminders_view', 'reminders_create', 'reminders_edit', 'reminders_delete')
GROUP BY user_id;

-- Analytics Basic: analytics_dashboard, analytics_invoices, analytics_payments, analytics_invoice_status
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'analytics_basic' as permission_key,
  bool_or(can_view) as can_view,
  false as can_create,
  false as can_edit,
  false as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('analytics_dashboard', 'analytics_invoices', 'analytics_payments', 'analytics_invoice_status')
GROUP BY user_id;

-- Analytics Advanced: analytics_revenue, analytics_customer, analytics_collector_performance, analytics_user_activity, analytics_email, analytics_stripe, analytics_comprehensive
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'analytics_advanced' as permission_key,
  bool_or(can_view) as can_view,
  false as can_create,
  false as can_edit,
  false as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('analytics_revenue', 'analytics_customer', 'analytics_collector_performance', 'analytics_user_activity', 'analytics_email', 'analytics_stripe', 'analytics_comprehensive')
GROUP BY user_id;

-- Monitoring: logs_sync, logs_webhook, logs_scheduler, monitor_cron, monitor_sync_status, email_logs
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'monitoring' as permission_key,
  bool_or(can_view) as can_view,
  false as can_create,
  false as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('logs_sync', 'logs_webhook', 'logs_scheduler', 'monitor_cron', 'monitor_sync_status', 'email_logs')
GROUP BY user_id;

-- Reports: reports_custom, reports_monthly, documents_view
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'reports' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('reports_custom', 'reports_monthly', 'documents_view')
GROUP BY user_id;

-- Stripe: stripe_payments, stripe_webhooks
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'stripe' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('stripe_payments', 'stripe_webhooks')
GROUP BY user_id;

-- Diagnostics: diagnostics_invoice_formats, diagnostics_orphaned_data, diagnostics_payment_applications, diagnostics_sync_status, acumatica_test
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'diagnostics' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('diagnostics_invoice_formats', 'diagnostics_orphaned_data', 'diagnostics_payment_applications', 'diagnostics_sync_status', 'acumatica_test')
GROUP BY user_id;

-- Acumatica: acumatica_customers, acumatica_sync, acumatica_credentials
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'acumatica' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('acumatica_customers', 'acumatica_sync', 'acumatica_credentials')
GROUP BY user_id;

-- Admin Users: admin_users, users_approval, users_activity_log, users_impersonation
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_users' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('admin_users', 'users_approval', 'users_activity_log', 'users_impersonation')
GROUP BY user_id;

-- Admin Roles: admin_roles
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_roles' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'admin_roles';

-- Admin Sync Config: admin_sync_config
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_sync_config' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'admin_sync_config';

-- Admin Webhooks: admin_webhook_config
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_webhooks' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'admin_webhook_config';

-- Admin Collector Control: collector_control_panel, collector_monitoring
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_collector_control' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('collector_control_panel', 'collector_monitoring')
GROUP BY user_id;

-- Admin Dashboard: admin_dashboard, admin_system_docs
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'admin_dashboard' as permission_key,
  bool_or(can_view) as can_view,
  bool_or(can_create) as can_create,
  bool_or(can_edit) as can_edit,
  bool_or(can_delete) as can_delete
FROM backup_user_custom_permissions
WHERE permission_key IN ('admin_dashboard', 'admin_system_docs')
GROUP BY user_id;

-- Dashboard Main: dashboard_main
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'dashboard_main' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'dashboard_main';

-- My Assignments: my_assignments
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'my_assignments' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'my_assignments';

-- Collection Ticketing: collection_ticketing
INSERT INTO user_custom_permissions (user_id, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 
  user_id,
  'collection_ticketing' as permission_key,
  can_view, can_create, can_edit, can_delete
FROM backup_user_custom_permissions
WHERE permission_key = 'collection_ticketing';

-- Remove duplicates that might have been created
DELETE FROM user_custom_permissions a USING user_custom_permissions b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.permission_key = b.permission_key;

/*
  # Comprehensive Role-Based Access Control System

  1. System Modules
    - Creates a comprehensive list of all system modules/features
    - Each module has a unique key and display name
    
  2. Role Definitions
    - Admin: Full access to all features
    - Manager: Access to analytics, reports, and management features
    - Collector: Access to customers, invoices, payments, and email system
    - Viewer: Read-only access to basic information
    
  3. Permissions Tables
    - `system_permissions`: Master list of all system features
    - `role_permissions`: Default permissions for each role
    - `user_custom_permissions`: User-specific permission overrides
    
  4. Permission Categories
    - Dashboard & Analytics
    - Customer Management
    - Invoice Management
    - Payment Management
    - Email System
    - Reports & Documents
    - System Administration
    - Acumatica Integration
    - Monitoring & Logs
    
  5. Security
    - RLS enabled on all tables
    - Only admins can modify permissions
    - All users can view their own permissions
*/

-- Create system_permissions table (master list of all features)
CREATE TABLE IF NOT EXISTS system_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text UNIQUE NOT NULL,
  permission_name text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create role_permissions table (default permissions per role)
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission_key text NOT NULL REFERENCES system_permissions(permission_key) ON DELETE CASCADE,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role, permission_key)
);

-- Create user_custom_permissions table (user-specific overrides)
CREATE TABLE IF NOT EXISTS user_custom_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES system_permissions(permission_key) ON DELETE CASCADE,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, permission_key)
);

-- Enable RLS
ALTER TABLE system_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for system_permissions
CREATE POLICY "Anyone can view system permissions"
  ON system_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage system permissions"
  ON system_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policies for role_permissions
CREATE POLICY "Anyone can view role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage role permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policies for user_custom_permissions
CREATE POLICY "Users can view their own custom permissions"
  ON user_custom_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can manage user custom permissions"
  ON user_custom_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Insert all system permissions
INSERT INTO system_permissions (permission_key, permission_name, category, description) VALUES
  -- Dashboard & Analytics
  ('dashboard_main', 'Main Dashboard', 'Dashboard & Analytics', 'Access to main dashboard overview'),
  ('analytics_invoices', 'Invoice Analytics', 'Dashboard & Analytics', 'View invoice analytics and statistics'),
  ('analytics_payments', 'Payment Analytics', 'Dashboard & Analytics', 'View payment analytics and statistics'),
  ('analytics_invoice_status', 'Invoice Status Analytics', 'Dashboard & Analytics', 'View invoice status analytics'),
  ('analytics_dashboard', 'Analytics Dashboard', 'Dashboard & Analytics', 'Access to comprehensive analytics dashboard'),
  
  -- Customer Management
  ('customers_view', 'View Customers', 'Customer Management', 'View customer list and details'),
  ('customers_edit', 'Edit Customers', 'Customer Management', 'Edit customer information'),
  ('customers_assignments', 'Customer Assignments', 'Customer Management', 'Manage customer assignments to users'),
  ('customers_files', 'Customer Files', 'Customer Management', 'Access customer files and documents'),
  ('customers_reports', 'Customer Reports', 'Customer Management', 'Generate and view customer reports'),
  ('customers_dashboard', 'Customer Dashboard', 'Customer Management', 'Access customer-specific dashboard'),
  
  -- Invoice Management
  ('invoices_view', 'View Invoices', 'Invoice Management', 'View invoice list and details'),
  ('invoices_edit', 'Edit Invoices', 'Invoice Management', 'Edit invoice information'),
  ('invoices_status', 'Invoice Status Control', 'Invoice Management', 'Change invoice status (red, yellow, green)'),
  ('invoices_memos', 'Invoice Memos', 'Invoice Management', 'Add and view invoice memos'),
  ('invoices_reminders', 'Invoice Reminders', 'Invoice Management', 'Create and manage invoice reminders'),
  ('invoices_acumatica', 'Acumatica Invoices', 'Invoice Management', 'View Acumatica invoice data'),
  
  -- Payment Management
  ('payments_view', 'View Payments', 'Payment Management', 'View payment list and details'),
  ('payments_edit', 'Edit Payments', 'Payment Management', 'Edit payment information'),
  ('payments_applications', 'Payment Applications', 'Payment Management', 'View payment applications to invoices'),
  ('payments_check_images', 'Payment Check Images', 'Payment Management', 'View payment check images'),
  ('payments_acumatica', 'Acumatica Payments', 'Payment Management', 'View Acumatica payment data'),
  
  -- Email System
  ('email_inbox', 'Email Inbox', 'Email System', 'Access email inbox and inbound emails'),
  ('email_send', 'Send Emails', 'Email System', 'Send customer invoice emails'),
  ('email_reply', 'Reply to Emails', 'Email System', 'Reply to inbound emails'),
  ('email_templates', 'Email Templates', 'Email System', 'Manage email templates'),
  ('email_formulas', 'Email Formulas', 'Email System', 'Manage email automation formulas'),
  ('email_logs', 'Email Logs', 'Email System', 'View email scheduler logs'),
  
  -- Reports & Documents
  ('reports_monthly', 'Monthly Reports', 'Reports & Documents', 'Generate and view monthly customer reports'),
  ('reports_custom', 'Custom Reports', 'Reports & Documents', 'Create custom reports'),
  ('documents_view', 'View Documents', 'Reports & Documents', 'View system documentation'),
  
  -- Reminders System
  ('reminders_view', 'View Reminders', 'Reminders System', 'View all reminders'),
  ('reminders_create', 'Create Reminders', 'Reminders System', 'Create new reminders'),
  ('reminders_edit', 'Edit Reminders', 'Reminders System', 'Edit existing reminders'),
  ('reminders_delete', 'Delete Reminders', 'Reminders System', 'Delete reminders'),
  
  -- System Administration
  ('admin_dashboard', 'Admin Dashboard', 'System Administration', 'Access admin dashboard'),
  ('admin_users', 'User Management', 'System Administration', 'Manage users and permissions'),
  ('admin_roles', 'Role Management', 'System Administration', 'Manage roles and role permissions'),
  ('admin_sync_config', 'Sync Configuration', 'System Administration', 'Configure Acumatica sync settings'),
  ('admin_webhook_config', 'Webhook Configuration', 'System Administration', 'Configure webhooks'),
  ('admin_system_docs', 'System Documentation', 'System Administration', 'Access system documentation'),
  
  -- Acumatica Integration
  ('acumatica_customers', 'Acumatica Customers', 'Acumatica Integration', 'View Acumatica customer data'),
  ('acumatica_sync', 'Acumatica Sync', 'Acumatica Integration', 'Trigger manual sync with Acumatica'),
  ('acumatica_test', 'Acumatica Testing', 'Acumatica Integration', 'Access Acumatica API testing tools'),
  ('acumatica_credentials', 'Acumatica Credentials', 'Acumatica Integration', 'Test and manage Acumatica credentials'),
  
  -- Monitoring & Logs
  ('logs_scheduler', 'Scheduler Logs', 'Monitoring & Logs', 'View scheduler logs'),
  ('logs_sync', 'Sync Logs', 'Monitoring & Logs', 'View sync change logs'),
  ('logs_webhook', 'Webhook Logs', 'Monitoring & Logs', 'View webhook logs'),
  ('monitor_cron', 'Cron Monitor', 'Monitoring & Logs', 'Monitor cron job status'),
  ('monitor_sync_status', 'Sync Status', 'Monitoring & Logs', 'View sync status dashboard')
ON CONFLICT (permission_key) DO NOTHING;

-- Insert default role permissions for ADMIN (full access)
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete)
SELECT 'admin', permission_key, true, true, true, true
FROM system_permissions
ON CONFLICT (role, permission_key) DO NOTHING;

-- Insert default role permissions for MANAGER
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard & Analytics (full access)
  ('manager', 'dashboard_main', true, false, false, false),
  ('manager', 'analytics_invoices', true, false, false, false),
  ('manager', 'analytics_payments', true, false, false, false),
  ('manager', 'analytics_invoice_status', true, false, false, false),
  ('manager', 'analytics_dashboard', true, false, false, false),
  
  -- Customer Management (view and edit)
  ('manager', 'customers_view', true, false, true, false),
  ('manager', 'customers_edit', true, false, true, false),
  ('manager', 'customers_assignments', true, true, true, false),
  ('manager', 'customers_files', true, true, false, false),
  ('manager', 'customers_reports', true, true, false, false),
  ('manager', 'customers_dashboard', true, false, false, false),
  
  -- Invoice Management (full access except delete)
  ('manager', 'invoices_view', true, false, false, false),
  ('manager', 'invoices_edit', true, false, true, false),
  ('manager', 'invoices_status', true, false, true, false),
  ('manager', 'invoices_memos', true, true, true, false),
  ('manager', 'invoices_reminders', true, true, true, true),
  ('manager', 'invoices_acumatica', true, false, false, false),
  
  -- Payment Management (view and edit)
  ('manager', 'payments_view', true, false, false, false),
  ('manager', 'payments_edit', true, false, true, false),
  ('manager', 'payments_applications', true, false, false, false),
  ('manager', 'payments_check_images', true, false, false, false),
  ('manager', 'payments_acumatica', true, false, false, false),
  
  -- Email System (full access)
  ('manager', 'email_inbox', true, false, false, false),
  ('manager', 'email_send', true, true, false, false),
  ('manager', 'email_reply', true, true, false, false),
  ('manager', 'email_templates', true, true, true, true),
  ('manager', 'email_formulas', true, true, true, true),
  ('manager', 'email_logs', true, false, false, false),
  
  -- Reports (full access)
  ('manager', 'reports_monthly', true, true, false, false),
  ('manager', 'reports_custom', true, true, false, false),
  ('manager', 'documents_view', true, false, false, false),
  
  -- Reminders (full access)
  ('manager', 'reminders_view', true, false, false, false),
  ('manager', 'reminders_create', true, true, false, false),
  ('manager', 'reminders_edit', true, false, true, false),
  ('manager', 'reminders_delete', true, false, false, true),
  
  -- Monitoring (view only)
  ('manager', 'logs_scheduler', true, false, false, false),
  ('manager', 'logs_sync', true, false, false, false),
  ('manager', 'logs_webhook', true, false, false, false),
  ('manager', 'monitor_sync_status', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Insert default role permissions for COLLECTOR
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard (view only)
  ('collector', 'dashboard_main', true, false, false, false),
  
  -- Customer Management (view and limited edit)
  ('collector', 'customers_view', true, false, false, false),
  ('collector', 'customers_files', true, true, false, false),
  ('collector', 'customers_dashboard', true, false, false, false),
  
  -- Invoice Management (view and status)
  ('collector', 'invoices_view', true, false, false, false),
  ('collector', 'invoices_status', true, false, true, false),
  ('collector', 'invoices_memos', true, true, true, false),
  ('collector', 'invoices_reminders', true, true, true, false),
  
  -- Payment Management (view only)
  ('collector', 'payments_view', true, false, false, false),
  ('collector', 'payments_applications', true, false, false, false),
  ('collector', 'payments_check_images', true, false, false, false),
  
  -- Email System (send and reply)
  ('collector', 'email_inbox', true, false, false, false),
  ('collector', 'email_send', true, true, false, false),
  ('collector', 'email_reply', true, true, false, false),
  ('collector', 'email_logs', true, false, false, false),
  
  -- Reminders (full access to own)
  ('collector', 'reminders_view', true, false, false, false),
  ('collector', 'reminders_create', true, true, false, false),
  ('collector', 'reminders_edit', true, false, true, false),
  ('collector', 'reminders_delete', true, false, false, true)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Insert default role permissions for VIEWER
INSERT INTO role_permissions (role, permission_key, can_view, can_create, can_edit, can_delete) VALUES
  -- Dashboard (view only)
  ('viewer', 'dashboard_main', true, false, false, false),
  ('viewer', 'analytics_invoices', true, false, false, false),
  ('viewer', 'analytics_payments', true, false, false, false),
  
  -- Customer Management (view only)
  ('viewer', 'customers_view', true, false, false, false),
  ('viewer', 'customers_files', true, false, false, false),
  ('viewer', 'customers_dashboard', true, false, false, false),
  
  -- Invoice Management (view only)
  ('viewer', 'invoices_view', true, false, false, false),
  ('viewer', 'invoices_memos', true, false, false, false),
  
  -- Payment Management (view only)
  ('viewer', 'payments_view', true, false, false, false),
  ('viewer', 'payments_applications', true, false, false, false),
  ('viewer', 'payments_check_images', true, false, false, false),
  
  -- Email System (view only)
  ('viewer', 'email_inbox', true, false, false, false),
  
  -- Reports (view only)
  ('viewer', 'reports_monthly', true, false, false, false),
  ('viewer', 'documents_view', true, false, false, false),
  
  -- Reminders (view only)
  ('viewer', 'reminders_view', true, false, false, false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Create function to get user permissions (combining role and custom permissions)
CREATE OR REPLACE FUNCTION get_user_permissions(user_uuid uuid)
RETURNS TABLE (
  permission_key text,
  permission_name text,
  category text,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  is_custom boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH user_role AS (
    SELECT role FROM user_profiles WHERE id = user_uuid
  ),
  base_permissions AS (
    SELECT 
      sp.permission_key,
      sp.permission_name,
      sp.category,
      COALESCE(rp.can_view, false) as can_view,
      COALESCE(rp.can_create, false) as can_create,
      COALESCE(rp.can_edit, false) as can_edit,
      COALESCE(rp.can_delete, false) as can_delete,
      false as is_custom
    FROM system_permissions sp
    LEFT JOIN role_permissions rp 
      ON sp.permission_key = rp.permission_key 
      AND rp.role = (SELECT role FROM user_role)
  )
  SELECT 
    COALESCE(ucp.permission_key, bp.permission_key) as permission_key,
    bp.permission_name,
    bp.category,
    COALESCE(ucp.can_view, bp.can_view) as can_view,
    COALESCE(ucp.can_create, bp.can_create) as can_create,
    COALESCE(ucp.can_edit, bp.can_edit) as can_edit,
    COALESCE(ucp.can_delete, bp.can_delete) as can_delete,
    (ucp.permission_key IS NOT NULL) as is_custom
  FROM base_permissions bp
  LEFT JOIN user_custom_permissions ucp 
    ON bp.permission_key = ucp.permission_key 
    AND ucp.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update updated_at on user_custom_permissions
CREATE OR REPLACE FUNCTION update_user_custom_permissions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_custom_permissions_timestamp_trigger
  BEFORE UPDATE ON user_custom_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_custom_permissions_timestamp();

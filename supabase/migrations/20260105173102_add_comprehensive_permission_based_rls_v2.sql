/*
  # Add Comprehensive Permission-Based RLS Policies (v2)

  1. Overview
    - Adds permission-checking RLS policies to all major data tables
    - Checks user permissions from role_permissions and user_custom_permissions
    - Ensures both frontend navigation AND backend data access respect permissions
    - Works with impersonation (uses auth.uid() which gives impersonated user ID)

  2. Permission Check Function
    - Creates reusable function to check if user has permission for a specific action
    - Checks custom permissions first, then falls back to role permissions
    - Admin role bypasses all checks

  3. Tables with New RLS Policies
    - acumatica_customers, acumatica_invoices, acumatica_payments
    - payment_invoice_applications, invoice_status_changes
    - invoice_reminders, invoice_memos, customer_files
    - collection_tickets, collector_assignments
    - email system tables, monitoring and logs tables

  4. Important Notes
    - All policies are RESTRICTIVE by default
    - Users MUST have the specific permission to access data
    - auth.uid() automatically works with impersonation
    - Admin role has full access to everything
*/

-- Create helper function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id uuid,
  p_permission_key text,
  p_action text DEFAULT 'view'
)
RETURNS boolean AS $$
DECLARE
  v_user_role text;
  v_has_permission boolean;
BEGIN
  SELECT role INTO v_user_role FROM user_profiles WHERE id = p_user_id;
  IF v_user_role = 'admin' THEN RETURN true; END IF;
  
  EXECUTE format('SELECT can_%I FROM user_custom_permissions WHERE user_id = $1 AND permission_key = $2', p_action)
  INTO v_has_permission USING p_user_id, p_permission_key;
  IF v_has_permission IS NOT NULL THEN RETURN v_has_permission; END IF;
  
  EXECUTE format('SELECT can_%I FROM role_permissions WHERE role = $1 AND permission_key = $2', p_action)
  INTO v_has_permission USING v_user_role, p_permission_key;
  
  RETURN COALESCE(v_has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ACUMATICA CUSTOMERS
DROP POLICY IF EXISTS "Users can view customers if they have permission" ON acumatica_customers;
DROP POLICY IF EXISTS "Users can edit customers if they have permission" ON acumatica_customers;

CREATE POLICY "Users can view customers if they have permission"
  ON acumatica_customers FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_view', 'view'));

CREATE POLICY "Users can edit customers if they have permission"
  ON acumatica_customers FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_edit', 'edit'));

-- ACUMATICA INVOICES
DROP POLICY IF EXISTS "Users can view invoices if they have permission" ON acumatica_invoices;
DROP POLICY IF EXISTS "Users can edit invoices if they have permission" ON acumatica_invoices;

CREATE POLICY "Users can view invoices if they have permission"
  ON acumatica_invoices FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'invoices_view', 'view'));

CREATE POLICY "Users can edit invoices if they have permission"
  ON acumatica_invoices FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'invoices_edit', 'edit'));

-- ACUMATICA PAYMENTS
DROP POLICY IF EXISTS "Users can view payments if they have permission" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can edit payments if they have permission" ON acumatica_payments;

CREATE POLICY "Users can view payments if they have permission"
  ON acumatica_payments FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'payments_view', 'view'));

CREATE POLICY "Users can edit payments if they have permission"
  ON acumatica_payments FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'payments_edit', 'edit'));

-- PAYMENT INVOICE APPLICATIONS
DROP POLICY IF EXISTS "Users can view payment applications if they have permission" ON payment_invoice_applications;

CREATE POLICY "Users can view payment applications if they have permission"
  ON payment_invoice_applications FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'payments_applications', 'view'));

-- INVOICE STATUS CHANGES
DROP POLICY IF EXISTS "Users can view status changes if they have permission" ON invoice_status_changes;
DROP POLICY IF EXISTS "Users can create status changes if they have permission" ON invoice_status_changes;

CREATE POLICY "Users can view status changes if they have permission"
  ON invoice_status_changes FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'invoices_status', 'view'));

CREATE POLICY "Users can create status changes if they have permission"
  ON invoice_status_changes FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'invoices_status', 'create'));

-- INVOICE REMINDERS
DROP POLICY IF EXISTS "Users can view their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can create their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can edit their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can delete their own reminders" ON invoice_reminders;

CREATE POLICY "Users can view their own reminders"
  ON invoice_reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND user_has_permission(auth.uid(), 'reminders_view', 'view'));

CREATE POLICY "Users can create their own reminders"
  ON invoice_reminders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND user_has_permission(auth.uid(), 'reminders_create', 'create'));

CREATE POLICY "Users can edit their own reminders"
  ON invoice_reminders FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND user_has_permission(auth.uid(), 'reminders_edit', 'edit'));

CREATE POLICY "Users can delete their own reminders"
  ON invoice_reminders FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND user_has_permission(auth.uid(), 'reminders_delete', 'delete'));

-- INVOICE MEMOS (uses created_by_user_id, not user_id)
DROP POLICY IF EXISTS "Users can view memos if they have permission" ON invoice_memos;
DROP POLICY IF EXISTS "Users can create memos if they have permission" ON invoice_memos;
DROP POLICY IF EXISTS "Users can edit memos if they have permission" ON invoice_memos;
DROP POLICY IF EXISTS "Users can delete memos if they have permission" ON invoice_memos;

CREATE POLICY "Users can view memos if they have permission"
  ON invoice_memos FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'invoices_memos', 'view'));

CREATE POLICY "Users can create memos if they have permission"
  ON invoice_memos FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'invoices_memos', 'create'));

CREATE POLICY "Users can edit their own memos"
  ON invoice_memos FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid() AND user_has_permission(auth.uid(), 'invoices_memos', 'edit'));

CREATE POLICY "Users can delete their own memos"
  ON invoice_memos FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid() AND user_has_permission(auth.uid(), 'invoices_memos', 'delete'));

-- CUSTOMER FILES
DROP POLICY IF EXISTS "Users can view customer files if they have permission" ON customer_files;
DROP POLICY IF EXISTS "Users can upload customer files if they have permission" ON customer_files;
DROP POLICY IF EXISTS "Users can delete customer files if they have permission" ON customer_files;

CREATE POLICY "Users can view customer files if they have permission"
  ON customer_files FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_files', 'view'));

CREATE POLICY "Users can upload customer files if they have permission"
  ON customer_files FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'customers_files', 'create'));

CREATE POLICY "Users can delete customer files if they have permission"
  ON customer_files FOR DELETE TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_files', 'delete'));

-- COLLECTION TICKETS
DROP POLICY IF EXISTS "Users can view tickets if they have permission" ON collection_tickets;
DROP POLICY IF EXISTS "Users can create tickets if they have permission" ON collection_tickets;
DROP POLICY IF EXISTS "Users can edit tickets if they have permission" ON collection_tickets;
DROP POLICY IF EXISTS "Collectors can view their assigned tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Collectors can update their assigned tickets" ON collection_tickets;

CREATE POLICY "Users can view tickets if they have permission"
  ON collection_tickets FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'collection_ticketing', 'view') OR assigned_collector_id = auth.uid());

CREATE POLICY "Users can create tickets if they have permission"
  ON collection_tickets FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'collection_ticketing', 'create'));

CREATE POLICY "Users can edit tickets if they have permission"
  ON collection_tickets FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'collection_ticketing', 'edit') OR assigned_collector_id = auth.uid());

-- COLLECTOR ASSIGNMENTS
DROP POLICY IF EXISTS "Users can view collector assignments if they have permission" ON collector_assignments;
DROP POLICY IF EXISTS "Users can create collector assignments if they have permission" ON collector_assignments;
DROP POLICY IF EXISTS "Collectors can view their own assignments" ON collector_assignments;
DROP POLICY IF EXISTS "Users can edit collector assignments if they have permission" ON collector_assignments;

CREATE POLICY "Users can view collector assignments if they have permission"
  ON collector_assignments FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_assignments', 'view') OR collector_id = auth.uid());

CREATE POLICY "Users can create collector assignments if they have permission"
  ON collector_assignments FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'customers_assignments', 'create'));

CREATE POLICY "Users can edit collector assignments if they have permission"
  ON collector_assignments FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'customers_assignments', 'edit'));

-- INBOUND EMAILS
DROP POLICY IF EXISTS "Users can view inbound emails if they have permission" ON inbound_emails;
CREATE POLICY "Users can view inbound emails if they have permission"
  ON inbound_emails FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'email_inbox', 'view'));

-- EMAIL TEMPLATES
DROP POLICY IF EXISTS "Users can view email templates if they have permission" ON email_templates;
DROP POLICY IF EXISTS "Users can edit email templates if they have permission" ON email_templates;

CREATE POLICY "Users can view email templates if they have permission"
  ON email_templates FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'email_templates', 'view'));

CREATE POLICY "Users can edit email templates if they have permission"
  ON email_templates FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'email_templates', 'edit'));

-- EMAIL FORMULAS
DROP POLICY IF EXISTS "Users can view email formulas if they have permission" ON email_formulas;
DROP POLICY IF EXISTS "Users can edit email formulas if they have permission" ON email_formulas;

CREATE POLICY "Users can view email formulas if they have permission"
  ON email_formulas FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'email_formulas', 'view'));

CREATE POLICY "Users can edit email formulas if they have permission"
  ON email_formulas FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'email_formulas', 'edit'));

-- EMAIL LOGS
DROP POLICY IF EXISTS "Users can view email logs if they have permission" ON email_logs;
CREATE POLICY "Users can view email logs if they have permission"
  ON email_logs FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'email_logs', 'view'));

-- SYNC STATUS
DROP POLICY IF EXISTS "Users can view sync status if they have permission" ON sync_status;
CREATE POLICY "Users can view sync status if they have permission"
  ON sync_status FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'monitor_sync_status', 'view'));

-- CRON JOB LOGS
DROP POLICY IF EXISTS "Users can view cron logs if they have permission" ON cron_job_logs;
CREATE POLICY "Users can view cron logs if they have permission"
  ON cron_job_logs FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'monitor_cron', 'view'));

-- SCHEDULER EXECUTION LOGS
DROP POLICY IF EXISTS "Users can view scheduler logs if they have permission" ON scheduler_execution_logs;
CREATE POLICY "Users can view scheduler logs if they have permission"
  ON scheduler_execution_logs FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'logs_scheduler', 'view'));

-- SYNC CHANGE LOGS
DROP POLICY IF EXISTS "Users can view sync logs if they have permission" ON sync_change_logs;
CREATE POLICY "Users can view sync logs if they have permission"
  ON sync_change_logs FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'logs_sync', 'view'));

-- USER ACTIVITY LOGS
DROP POLICY IF EXISTS "Admins can view all activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Users can view their own activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Users with permission can view activity logs" ON user_activity_logs;

CREATE POLICY "Users with permission can view activity logs"
  ON user_activity_logs FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'users_activity_log', 'view') OR user_id = auth.uid());

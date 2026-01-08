/*
  # Add Indexes for Unindexed Foreign Keys

  1. Performance Optimization
    - Add indexes on foreign key columns that were missing indexes
    - This improves JOIN performance and query speed

  2. Tables Affected
    - acumatica_customers (color_status_updated_by, excluded_by)
    - acumatica_payments (last_modified_by)
    - collection_tickets (created_by)
    - collector_assignments (assigned_by)
    - collector_email_schedules (created_by, customer_id, email_template_id)
    - customer_assignments (formula_id, template_id)
    - customer_files (inbound_email_id, uploaded_by)
    - email_analysis (processed_by_admin)
    - email_logs (assignment_id, template_id)
    - invoice_activity_log (user_id)
    - invoice_assignments (assigned_by, ticket_id)
    - invoice_current_status (last_updated_by)
    - invoice_reminders (invoice_id)
    - invoice_status_changes (modified_by)
    - pending_users (reviewed_by)
    - reminder_notifications (reminder_id)
    - role_permissions (permission_key)
    - sync_change_logs (user_id)
    - ticket_invoices (added_by)
    - user_custom_permissions (permission_key, updated_by)
    - user_profiles (approved_by)
    - user_reminder_notifications (invoice_id, reminder_id)
*/

-- acumatica_customers foreign key indexes
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_color_status_updated_by 
  ON acumatica_customers(color_status_updated_by);

CREATE INDEX IF NOT EXISTS idx_acumatica_customers_excluded_by 
  ON acumatica_customers(excluded_by);

-- acumatica_payments foreign key indexes
CREATE INDEX IF NOT EXISTS idx_acumatica_payments_last_modified_by 
  ON acumatica_payments(last_modified_by);

-- collection_tickets foreign key indexes
CREATE INDEX IF NOT EXISTS idx_collection_tickets_created_by 
  ON collection_tickets(created_by);

-- collector_assignments foreign key indexes
CREATE INDEX IF NOT EXISTS idx_collector_assignments_assigned_by 
  ON collector_assignments(assigned_by);

-- collector_email_schedules foreign key indexes
CREATE INDEX IF NOT EXISTS idx_collector_email_schedules_created_by 
  ON collector_email_schedules(created_by);

CREATE INDEX IF NOT EXISTS idx_collector_email_schedules_customer_id 
  ON collector_email_schedules(customer_id);

CREATE INDEX IF NOT EXISTS idx_collector_email_schedules_email_template_id 
  ON collector_email_schedules(email_template_id);

-- customer_assignments foreign key indexes
CREATE INDEX IF NOT EXISTS idx_customer_assignments_formula_id 
  ON customer_assignments(formula_id);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_template_id 
  ON customer_assignments(template_id);

-- customer_files foreign key indexes
CREATE INDEX IF NOT EXISTS idx_customer_files_inbound_email_id 
  ON customer_files(inbound_email_id);

CREATE INDEX IF NOT EXISTS idx_customer_files_uploaded_by 
  ON customer_files(uploaded_by);

-- email_analysis foreign key indexes
CREATE INDEX IF NOT EXISTS idx_email_analysis_processed_by_admin 
  ON email_analysis(processed_by_admin);

-- email_logs foreign key indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_assignment_id 
  ON email_logs(assignment_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_template_id 
  ON email_logs(template_id);

-- invoice_activity_log foreign key indexes
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_user_id 
  ON invoice_activity_log(user_id);

-- invoice_assignments foreign key indexes
CREATE INDEX IF NOT EXISTS idx_invoice_assignments_assigned_by 
  ON invoice_assignments(assigned_by);

CREATE INDEX IF NOT EXISTS idx_invoice_assignments_ticket_id 
  ON invoice_assignments(ticket_id);

-- invoice_current_status foreign key indexes
CREATE INDEX IF NOT EXISTS idx_invoice_current_status_last_updated_by 
  ON invoice_current_status(last_updated_by);

-- invoice_reminders foreign key indexes
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_id 
  ON invoice_reminders(invoice_id);

-- invoice_status_changes foreign key indexes
CREATE INDEX IF NOT EXISTS idx_invoice_status_changes_modified_by 
  ON invoice_status_changes(modified_by);

-- pending_users foreign key indexes
CREATE INDEX IF NOT EXISTS idx_pending_users_reviewed_by 
  ON pending_users(reviewed_by);

-- reminder_notifications foreign key indexes
CREATE INDEX IF NOT EXISTS idx_reminder_notifications_reminder_id 
  ON reminder_notifications(reminder_id);

-- role_permissions foreign key indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key 
  ON role_permissions(permission_key);

-- sync_change_logs foreign key indexes
CREATE INDEX IF NOT EXISTS idx_sync_change_logs_user_id 
  ON sync_change_logs(user_id);

-- ticket_invoices foreign key indexes
CREATE INDEX IF NOT EXISTS idx_ticket_invoices_added_by 
  ON ticket_invoices(added_by);

-- user_custom_permissions foreign key indexes
CREATE INDEX IF NOT EXISTS idx_user_custom_permissions_permission_key 
  ON user_custom_permissions(permission_key);

CREATE INDEX IF NOT EXISTS idx_user_custom_permissions_updated_by 
  ON user_custom_permissions(updated_by);

-- user_profiles foreign key indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_approved_by 
  ON user_profiles(approved_by);

-- user_reminder_notifications foreign key indexes
CREATE INDEX IF NOT EXISTS idx_user_reminder_notifications_invoice_id 
  ON user_reminder_notifications(invoice_id);

CREATE INDEX IF NOT EXISTS idx_user_reminder_notifications_reminder_id 
  ON user_reminder_notifications(reminder_id);

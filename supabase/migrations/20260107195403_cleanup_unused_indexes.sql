/*
  # Clean Up Unused Indexes

  1. Index Cleanup
    - Remove indexes that have not been used
    - These indexes consume storage and slow down writes without providing query benefits

  2. Note
    - These indexes were identified as unused by database monitoring
    - If any queries start performing slowly, the indexes can be recreated
*/

-- Remove unused webhook indexes
DROP INDEX IF EXISTS idx_webhook_logs_type;
DROP INDEX IF EXISTS idx_webhook_logs_entity_id;

-- Remove unused customer indexes
DROP INDEX IF EXISTS idx_customers_is_active;
DROP INDEX IF EXISTS idx_customers_postpone_until;

-- Remove unused customer_assignments indexes
DROP INDEX IF EXISTS idx_customer_assignments_is_active;

-- Remove unused email_logs indexes
DROP INDEX IF EXISTS idx_email_logs_scheduled_for;
DROP INDEX IF EXISTS idx_email_logs_sendgrid_message_id;
DROP INDEX IF EXISTS idx_email_logs_processing_timestamp;
DROP INDEX IF EXISTS idx_email_logs_customer_email;

-- Remove unused collector indexes
DROP INDEX IF EXISTS idx_collector_assignments_customer;
DROP INDEX IF EXISTS idx_collector_email_schedules_scheduled;

-- Remove unused change log indexes
DROP INDEX IF EXISTS idx_invoice_change_log_invoice;
DROP INDEX IF EXISTS idx_payment_change_log_payment;

-- Remove unused user_profiles indexes
DROP INDEX IF EXISTS idx_user_profiles_color;
DROP INDEX IF EXISTS idx_user_profiles_permissions;

-- Remove unused invoice_reminders indexes
DROP INDEX IF EXISTS idx_invoice_reminders_email_pending;
DROP INDEX IF EXISTS idx_invoice_reminders_triggered;

-- Remove unused reminder_notifications indexes
DROP INDEX IF EXISTS idx_reminder_notifications_user_id;
DROP INDEX IF EXISTS idx_reminder_notifications_dismissed;

-- Remove unused sync_change_logs indexes
DROP INDEX IF EXISTS idx_sync_logs_sync_source;
DROP INDEX IF EXISTS idx_sync_logs_entity_id;

-- Remove unused cron_job_logs indexes
DROP INDEX IF EXISTS idx_cron_job_logs_status;

-- Remove unused email_analysis indexes
DROP INDEX IF EXISTS idx_email_analysis_detected_intent;

-- Remove unused customer_files indexes
DROP INDEX IF EXISTS idx_customer_files_customer_id;
DROP INDEX IF EXISTS idx_customer_files_month_year;

-- Remove unused email_notifications indexes
DROP INDEX IF EXISTS idx_email_notifications_admin_id;

-- Remove unused outbound_replies indexes
DROP INDEX IF EXISTS idx_outbound_replies_inbound_email;
DROP INDEX IF EXISTS idx_outbound_replies_sent_by;

-- Remove unused inbound_emails indexes
DROP INDEX IF EXISTS idx_inbound_emails_is_important;
DROP INDEX IF EXISTS idx_inbound_emails_acumatica_ref;

-- Remove unused email_labels indexes
DROP INDEX IF EXISTS idx_email_labels_created_by;
DROP INDEX IF EXISTS idx_email_label_assignments_email_id;
DROP INDEX IF EXISTS idx_email_label_assignments_label_id;

-- Remove unused scheduler_execution_logs indexes
DROP INDEX IF EXISTS idx_scheduler_execution_logs_execution_id;
DROP INDEX IF EXISTS idx_scheduler_execution_logs_test_mode;

-- Remove unused billing indexes
DROP INDEX IF EXISTS idx_billing_customers_acumatica_id;
DROP INDEX IF EXISTS idx_billing_customers_is_active;
DROP INDEX IF EXISTS idx_billing_reports_customer_id;
DROP INDEX IF EXISTS idx_billing_reports_period;
DROP INDEX IF EXISTS idx_billing_reports_generated_at;

-- Remove unused acumatica_transactions indexes
DROP INDEX IF EXISTS idx_acumatica_transactions_customer_id;
DROP INDEX IF EXISTS idx_acumatica_transactions_date;
DROP INDEX IF EXISTS idx_acumatica_transactions_type;

-- Remove unused report_templates indexes
DROP INDEX IF EXISTS idx_report_templates_is_active;

-- Remove unused status_changes indexes
DROP INDEX IF EXISTS idx_status_changes_user;
DROP INDEX IF EXISTS idx_status_changes_reference;
DROP INDEX IF EXISTS idx_status_history_user;
DROP INDEX IF EXISTS idx_current_status_status;

-- Remove unused collection_tickets indexes
DROP INDEX IF EXISTS idx_collection_tickets_assigned_at;
DROP INDEX IF EXISTS idx_collection_tickets_assigned_by;
DROP INDEX IF EXISTS idx_collection_tickets_customer;
DROP INDEX IF EXISTS idx_collection_tickets_status;

-- Remove unused activity_logs indexes
DROP INDEX IF EXISTS idx_activity_logs_entity;

-- Remove unused acumatica_documents indexes
DROP INDEX IF EXISTS idx_acumatica_documents_reference_id;
DROP INDEX IF EXISTS idx_acumatica_documents_document_type;
DROP INDEX IF EXISTS idx_acumatica_documents_synced_at;

-- Remove unused acumatica_invoices indexes
DROP INDEX IF EXISTS idx_acumatica_invoices_customer_order;
DROP INDEX IF EXISTS idx_invoices_customer_date;
DROP INDEX IF EXISTS idx_invoices_color_status_date;
DROP INDEX IF EXISTS idx_invoices_customer_status;

-- Remove unused user_reminder_notifications indexes
DROP INDEX IF EXISTS idx_user_reminder_notifications_user_id;
DROP INDEX IF EXISTS idx_user_reminder_notifications_is_read;

-- Remove unused invoice_memos indexes
DROP INDEX IF EXISTS idx_invoice_memos_created_by;

-- Remove unused payment_fetch_logs indexes
DROP INDEX IF EXISTS idx_payment_fetch_logs_fetched_at;
DROP INDEX IF EXISTS idx_payment_fetch_logs_fetched_by;

-- Remove unused payments indexes
DROP INDEX IF EXISTS idx_payments_payment_method;
DROP INDEX IF EXISTS idx_payments_application_history;

-- Remove unused customer analytics exclusion indexes
DROP INDEX IF EXISTS idx_customers_payment_analytics_exclusion;
DROP INDEX IF EXISTS idx_customers_invoice_analytics_exclusion;

-- Remove unused trigram indexes (keeping search_vector indexes for full-text search)
DROP INDEX IF EXISTS idx_invoices_customer_name_trgm;
DROP INDEX IF EXISTS idx_invoices_description_trgm;
DROP INDEX IF EXISTS idx_invoices_type_trgm;
DROP INDEX IF EXISTS idx_payments_reference_number_trgm;
DROP INDEX IF EXISTS idx_payments_customer_id_trgm;
DROP INDEX IF EXISTS idx_payments_description_trgm;
DROP INDEX IF EXISTS idx_payments_payment_ref_trgm;

-- Remove unused customer status indexes
DROP INDEX IF EXISTS idx_customers_contact_status;
DROP INDEX IF EXISTS idx_customers_color_status;

-- Remove unused customer_notes indexes
DROP INDEX IF EXISTS idx_customer_notes_created_at;
DROP INDEX IF EXISTS idx_customer_notes_user;

-- Remove unused password_reset_tokens indexes
DROP INDEX IF EXISTS idx_password_reset_tokens_email;
DROP INDEX IF EXISTS idx_password_reset_tokens_expires_at;

-- Remove unused search indexes
DROP INDEX IF EXISTS idx_invoices_search_vector;
DROP INDEX IF EXISTS idx_inbound_emails_search_vector;

-- Remove unused ticket_invoices index
DROP INDEX IF EXISTS idx_ticket_invoices_invoice;

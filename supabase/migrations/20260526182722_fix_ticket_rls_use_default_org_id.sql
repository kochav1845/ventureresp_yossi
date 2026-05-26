/*
  # Fix collection_tickets RLS for inserts

  The WITH CHECK policy fails because organization_id is NULL at insert time.
  BEFORE INSERT triggers run AFTER policy evaluation in PostgreSQL.
  
  Fix: Set a column DEFAULT that calls get_user_org_id(), so the value is
  populated before the policy evaluates.
*/

-- Set default on collection_tickets.organization_id
ALTER TABLE collection_tickets 
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

-- Do the same for other tables that have insert policies checking org_id
DO $$
DECLARE
  tbl text;
  tables_with_org text[] := ARRAY[
    'ticket_activity_log',
    'ticket_notes', 
    'ticket_status_history',
    'invoice_assignments',
    'invoice_memos',
    'invoice_reminders',
    'invoice_activity_log',
    'invoice_status_changes',
    'invoice_status_history',
    'invoice_current_status',
    'user_activity_logs',
    'auto_ticket_rules',
    'customer_email_tracking',
    'customer_monthly_tracking',
    'customer_monthly_files',
    'sync_change_logs',
    'excluded_customers',
    'saved_customer_filters',
    'user_quick_filters',
    'collector_customer_assignments',
    'customer_report_templates',
    'email_settings',
    'department_email_senders'
  ];
BEGIN
  FOR tbl IN SELECT unnest(tables_with_org)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET DEFAULT get_user_org_id()', tbl);
    END IF;
  END LOOP;
END;
$$;

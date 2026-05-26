/*
  # Auto-set organization_id on insert for user-facing tables

  Instead of requiring the frontend to pass organization_id on every insert,
  use a BEFORE INSERT trigger that auto-fills it from the user's org context.
  This fixes RLS violations when the frontend doesn't include org_id.
*/

CREATE OR REPLACE FUNCTION set_org_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;

-- collection_tickets
DROP TRIGGER IF EXISTS set_org_id_collection_tickets ON collection_tickets;
CREATE TRIGGER set_org_id_collection_tickets
  BEFORE INSERT ON collection_tickets
  FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();

-- ticket_activity_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_activity_log' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_ticket_activity_log ON ticket_activity_log;
    CREATE TRIGGER set_org_id_ticket_activity_log
      BEFORE INSERT ON ticket_activity_log
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- ticket_notes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_notes' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_ticket_notes ON ticket_notes;
    CREATE TRIGGER set_org_id_ticket_notes
      BEFORE INSERT ON ticket_notes
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- ticket_status_history
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_status_history' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_ticket_status_history ON ticket_status_history;
    CREATE TRIGGER set_org_id_ticket_status_history
      BEFORE INSERT ON ticket_status_history
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- invoice_assignments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_assignments' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_invoice_assignments ON invoice_assignments;
    CREATE TRIGGER set_org_id_invoice_assignments
      BEFORE INSERT ON invoice_assignments
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- invoice_memos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_memos' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_invoice_memos ON invoice_memos;
    CREATE TRIGGER set_org_id_invoice_memos
      BEFORE INSERT ON invoice_memos
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- invoice_reminders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_reminders' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_invoice_reminders ON invoice_reminders;
    CREATE TRIGGER set_org_id_invoice_reminders
      BEFORE INSERT ON invoice_reminders
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- invoice_activity_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_activity_log' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_invoice_activity_log ON invoice_activity_log;
    CREATE TRIGGER set_org_id_invoice_activity_log
      BEFORE INSERT ON invoice_activity_log
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- invoice_status_changes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_status_changes' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_invoice_status_changes ON invoice_status_changes;
    CREATE TRIGGER set_org_id_invoice_status_changes
      BEFORE INSERT ON invoice_status_changes
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- user_activity_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_activity_logs' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_user_activity_logs ON user_activity_logs;
    CREATE TRIGGER set_org_id_user_activity_logs
      BEFORE INSERT ON user_activity_logs
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- auto_ticket_rules
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auto_ticket_rules' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_auto_ticket_rules ON auto_ticket_rules;
    CREATE TRIGGER set_org_id_auto_ticket_rules
      BEFORE INSERT ON auto_ticket_rules
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- customer_email_tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_email_tracking' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_customer_email_tracking ON customer_email_tracking;
    CREATE TRIGGER set_org_id_customer_email_tracking
      BEFORE INSERT ON customer_email_tracking
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- customer_monthly_tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_monthly_tracking' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_customer_monthly_tracking ON customer_monthly_tracking;
    CREATE TRIGGER set_org_id_customer_monthly_tracking
      BEFORE INSERT ON customer_monthly_tracking
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

-- sync_change_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_change_logs' AND column_name = 'organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_sync_change_logs ON sync_change_logs;
    CREATE TRIGGER set_org_id_sync_change_logs
      BEFORE INSERT ON sync_change_logs
      FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();
  END IF;
END;
$$;

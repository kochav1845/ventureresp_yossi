/*
  # Fix Ticket Activity Trigger - Remove Active Column Reference

  1. Overview
    - The `log_collection_ticket_activity()` trigger function references `OLD.active` / `NEW.active`
    - The `active` column was dropped from `collection_tickets` in a prior migration
    - This causes a runtime error: `record "old" has no field "active"`

  2. Changes
    - Recreate `log_collection_ticket_activity()` without any reference to the `active` column
    - Ticket closed/reopened detection now uses the `status` column instead
    - All other logging (status, priority, assignment, promise date) unchanged

  3. Security
    - Function remains SECURITY DEFINER
    - No RLS changes
*/

DROP FUNCTION IF EXISTS log_collection_ticket_activity() CASCADE;

CREATE OR REPLACE FUNCTION log_collection_ticket_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_count integer := 0;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT COUNT(*) INTO v_invoice_count
    FROM ticket_invoices
    WHERE ticket_id = NEW.id;

    INSERT INTO user_activity_logs (
      user_id, action_type, entity_type, entity_id, details
    )
    VALUES (
      COALESCE(NEW.assigned_collector_id, auth.uid()),
      'ticket_created',
      'collection_ticket',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'ticket_type', NEW.ticket_type,
        'status', NEW.status,
        'priority', NEW.priority,
        'invoice_count', v_invoice_count
      )
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO user_activity_logs (
        user_id, action_type, entity_type, entity_id, details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        CASE
          WHEN NEW.status = 'closed' THEN 'ticket_closed'
          WHEN OLD.status = 'closed' AND NEW.status != 'closed' THEN 'ticket_reopened'
          ELSE 'ticket_status_changed'
        END,
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;

    IF (OLD.priority IS DISTINCT FROM NEW.priority) THEN
      INSERT INTO user_activity_logs (
        user_id, action_type, entity_type, entity_id, details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        'ticket_priority_changed',
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_priority', OLD.priority,
          'new_priority', NEW.priority
        )
      );
    END IF;

    IF (OLD.assigned_collector_id IS DISTINCT FROM NEW.assigned_collector_id) THEN
      INSERT INTO user_activity_logs (
        user_id, action_type, entity_type, entity_id, details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        'ticket_reassigned',
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_assignee', OLD.assigned_collector_id,
          'new_assignee', NEW.assigned_collector_id
        )
      );
    END IF;

    IF (OLD.promise_date IS DISTINCT FROM NEW.promise_date) THEN
      INSERT INTO user_activity_logs (
        user_id, action_type, entity_type, entity_id, details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        'ticket_promise_date_set',
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_promise_date', OLD.promise_date,
          'new_promise_date', NEW.promise_date
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS collection_tickets_activity_trigger ON collection_tickets;
CREATE TRIGGER collection_tickets_activity_trigger
  AFTER INSERT OR UPDATE ON collection_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_collection_ticket_activity();

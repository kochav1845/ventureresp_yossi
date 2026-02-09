/*
  # Fix Invoice Count in Collection Ticket Activity Logging
  
  This migration fixes the collection ticket activity logging trigger to properly count invoices
  from the ticket_invoices junction table instead of referencing a non-existent invoice_references column.
  
  ## Changes
  
  - Remove reference to non-existent invoice_references column
  - Calculate invoice count from ticket_invoices table instead
*/

-- Drop and recreate the trigger function with correct invoice count logic
DROP FUNCTION IF EXISTS log_collection_ticket_activity() CASCADE;

CREATE OR REPLACE FUNCTION log_collection_ticket_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_count integer := 0;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Get invoice count from ticket_invoices table
    SELECT COUNT(*) INTO v_invoice_count
    FROM ticket_invoices
    WHERE ticket_id = NEW.id;
    
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
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
    -- Log status changes
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        'ticket_status_changed',
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;

    -- Log priority changes
    IF (OLD.priority IS DISTINCT FROM NEW.priority) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
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

    -- Log assignment changes
    IF (OLD.assigned_collector_id IS DISTINCT FROM NEW.assigned_collector_id) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
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

    -- Log promise date changes
    IF (OLD.promise_date IS DISTINCT FROM NEW.promise_date) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
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

    -- Log active status changes (ticket closed/reopened)
    IF (OLD.active IS DISTINCT FROM NEW.active) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_collector_id),
        CASE WHEN NEW.active THEN 'ticket_reopened' ELSE 'ticket_closed' END,
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'status', NEW.status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS collection_tickets_activity_trigger ON collection_tickets;
CREATE TRIGGER collection_tickets_activity_trigger
  AFTER INSERT OR UPDATE ON collection_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_collection_ticket_activity();
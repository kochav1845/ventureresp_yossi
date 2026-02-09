/*
  # Enhance Collector Activity Logging System

  1. New Features
    - Add triggers for collection ticket activities
    - Add triggers for invoice color status changes
    - Add triggers for promise date changes
    - Add triggers for ticket notes
    - Add triggers for ticket status/type changes

  2. Changes
    - Create comprehensive logging functions for all collector actions
    - Track ticket creation, updates, assignments, and closures
    - Track all invoice interactions by collectors
    
  3. Notes
    - This enables complete audit trail of collector activities
    - Admins can monitor collector productivity and actions
*/

-- Trigger function for collection ticket activities
CREATE OR REPLACE FUNCTION log_collection_ticket_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      COALESCE(NEW.assigned_to, auth.uid()),
      'ticket_created',
      'collection_ticket',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'ticket_type', NEW.ticket_type,
        'status', NEW.status,
        'priority', NEW.priority,
        'invoice_count', COALESCE(jsonb_array_length(NEW.invoice_references), 0)
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
        COALESCE(auth.uid(), NEW.assigned_to),
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
        COALESCE(auth.uid(), NEW.assigned_to),
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
    IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        COALESCE(auth.uid(), NEW.assigned_to),
        'ticket_reassigned',
        'collection_ticket',
        NEW.id::text,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_assignee', OLD.assigned_to,
          'new_assignee', NEW.assigned_to
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
        COALESCE(auth.uid(), NEW.assigned_to),
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
        COALESCE(auth.uid(), NEW.assigned_to),
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
$$;

-- Trigger function for ticket notes
CREATE OR REPLACE FUNCTION log_ticket_note_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_info RECORD;
BEGIN
  -- Get ticket info
  SELECT customer_name INTO v_ticket_info
  FROM collection_tickets
  WHERE id = COALESCE(NEW.ticket_id, OLD.ticket_id);

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      NEW.user_id,
      'ticket_note_added',
      'collection_ticket',
      NEW.ticket_id::text,
      jsonb_build_object(
        'customer_name', v_ticket_info.customer_name,
        'note_preview', LEFT(NEW.note_text, 100),
        'note_type', NEW.note_type
      )
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      NEW.user_id,
      'ticket_note_updated',
      'collection_ticket',
      NEW.ticket_id::text,
      jsonb_build_object(
        'customer_name', v_ticket_info.customer_name,
        'note_preview', LEFT(NEW.note_text, 100)
      )
    );
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      OLD.user_id,
      'ticket_note_deleted',
      'collection_ticket',
      OLD.ticket_id::text,
      jsonb_build_object(
        'customer_name', v_ticket_info.customer_name
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger function for invoice color status changes (collector actions)
CREATE OR REPLACE FUNCTION log_invoice_color_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.color_status IS DISTINCT FROM NEW.color_status AND auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'invoice_color_changed',
      'invoice',
      NEW.reference_number,
      jsonb_build_object(
        'customer', NEW.customer,
        'old_color', OLD.color_status,
        'new_color', NEW.color_status,
        'balance', NEW.balance
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for invoice promise dates (set by collectors)
CREATE OR REPLACE FUNCTION log_invoice_promise_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.promise_to_pay_date IS DISTINCT FROM NEW.promise_to_pay_date AND auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'invoice_promise_date_set',
      'invoice',
      NEW.reference_number,
      jsonb_build_object(
        'customer', NEW.customer,
        'old_promise_date', OLD.promise_to_pay_date,
        'new_promise_date', NEW.promise_to_pay_date,
        'balance', NEW.balance
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create/Replace triggers
DROP TRIGGER IF EXISTS trigger_log_collection_ticket ON collection_tickets;
CREATE TRIGGER trigger_log_collection_ticket
  AFTER INSERT OR UPDATE ON collection_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_collection_ticket_activity();

DROP TRIGGER IF EXISTS trigger_log_ticket_note ON ticket_notes;
CREATE TRIGGER trigger_log_ticket_note
  AFTER INSERT OR UPDATE OR DELETE ON ticket_notes
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_note_activity();

DROP TRIGGER IF EXISTS trigger_log_invoice_color_status ON acumatica_invoices;
CREATE TRIGGER trigger_log_invoice_color_status
  AFTER UPDATE ON acumatica_invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_color_status_change();

DROP TRIGGER IF EXISTS trigger_log_invoice_promise_date ON acumatica_invoices;
CREATE TRIGGER trigger_log_invoice_promise_date
  AFTER UPDATE ON acumatica_invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_promise_date_change();

-- Function to get collector activity summary
CREATE OR REPLACE FUNCTION get_collector_activity_summary(
  p_user_id UUID DEFAULT NULL,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  total_actions BIGINT,
  login_count BIGINT,
  tickets_created BIGINT,
  tickets_closed BIGINT,
  notes_added BIGINT,
  status_changes BIGINT,
  invoice_color_changes BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id,
    up.full_name,
    up.email,
    up.role,
    COUNT(ual.id) as total_actions,
    COUNT(ual.id) FILTER (WHERE ual.action_type = 'user_login') as login_count,
    COUNT(ual.id) FILTER (WHERE ual.action_type = 'ticket_created') as tickets_created,
    COUNT(ual.id) FILTER (WHERE ual.action_type = 'ticket_closed') as tickets_closed,
    COUNT(ual.id) FILTER (WHERE ual.action_type IN ('ticket_note_added', 'memo_added')) as notes_added,
    COUNT(ual.id) FILTER (WHERE ual.action_type LIKE '%status_changed%') as status_changes,
    COUNT(ual.id) FILTER (WHERE ual.action_type = 'invoice_color_changed') as invoice_color_changes,
    MAX(ual.created_at) as last_activity
  FROM user_profiles up
  LEFT JOIN user_activity_logs ual ON up.id = ual.user_id
    AND ual.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
  WHERE up.role IN ('collector', 'manager', 'admin')
    AND (p_user_id IS NULL OR up.id = p_user_id)
  GROUP BY up.id, up.full_name, up.email, up.role
  ORDER BY total_actions DESC;
END;
$$;

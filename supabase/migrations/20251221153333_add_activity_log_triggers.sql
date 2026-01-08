/*
  # Add Automated Activity Log Triggers

  1. Triggers
    - Log when invoice status is changed
    - Log when invoice memos are added
    - Log when user profiles are updated
    - Log when customer assignments change

  2. Changes
    - Create trigger functions for automatic logging
    - Attach triggers to relevant tables
*/

-- Trigger function for invoice status changes
CREATE OR REPLACE FUNCTION log_invoice_status_change()
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
      NEW.last_updated_by,
      'invoice_status_set',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'status', NEW.status,
        'customer_id', NEW.customer_id
      )
    );
  ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      NEW.last_updated_by,
      'invoice_status_changed',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'customer_id', NEW.customer_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for invoice memos
CREATE OR REPLACE FUNCTION log_invoice_memo_activity()
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
      NEW.user_id,
      'memo_added',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'memo_text', LEFT(NEW.memo_text, 100),
        'has_attachment', NEW.attachment_url IS NOT NULL,
        'customer_id', NEW.customer_id
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
      'memo_updated',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'memo_text', LEFT(NEW.memo_text, 100),
        'customer_id', NEW.customer_id
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
      'memo_deleted',
      'invoice',
      OLD.invoice_reference,
      jsonb_build_object(
        'customer_id', OLD.customer_id
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger function for user profile updates
CREATE OR REPLACE FUNCTION log_user_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL) THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        auth.uid(),
        'user_role_changed',
        'user_profile',
        NEW.id::text,
        jsonb_build_object(
          'old_role', OLD.role,
          'new_role', NEW.role,
          'target_user_email', NEW.email
        )
      );
    END IF;
    
    IF (OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        auth.uid(),
        'user_profile_updated',
        'user_profile',
        NEW.id::text,
        jsonb_build_object(
          'field', 'full_name',
          'old_value', OLD.full_name,
          'new_value', NEW.full_name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for customer assignments
CREATE OR REPLACE FUNCTION log_customer_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'customer_assigned',
      'customer',
      NEW.customer_id,
      jsonb_build_object(
        'assigned_to_user_id', NEW.user_id,
        'customer_name', NEW.customer_name
      )
    );
  ELSIF (TG_OP = 'DELETE' AND auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),
      'customer_unassigned',
      'customer',
      OLD.customer_id,
      jsonb_build_object(
        'unassigned_from_user_id', OLD.user_id,
        'customer_name', OLD.customer_name
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_log_invoice_status ON invoice_current_status;
CREATE TRIGGER trigger_log_invoice_status
  AFTER INSERT OR UPDATE ON invoice_current_status
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_status_change();

DROP TRIGGER IF EXISTS trigger_log_invoice_memo ON invoice_memos;
CREATE TRIGGER trigger_log_invoice_memo
  AFTER INSERT OR UPDATE OR DELETE ON invoice_memos
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_memo_activity();

DROP TRIGGER IF EXISTS trigger_log_user_profile_update ON user_profiles;
CREATE TRIGGER trigger_log_user_profile_update
  AFTER UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION log_user_profile_update();

DROP TRIGGER IF EXISTS trigger_log_customer_assignment ON customer_assignments;
CREATE TRIGGER trigger_log_customer_assignment
  AFTER INSERT OR DELETE ON customer_assignments
  FOR EACH ROW
  EXECUTE FUNCTION log_customer_assignment_change();
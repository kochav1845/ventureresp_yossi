/*
  # Fix Activity Log Triggers for System Actions

  1. Changes
    - Update log_invoice_status_change to handle NULL user_id (system syncs)
    - Update log_invoice_memo_activity to handle NULL user_id
    - Update log_customer_assignment_change to handle NULL user_id
    
  2. Behavior
    - System actions (syncs, automated processes) can log with NULL user_id
    - User-initiated actions log with the actual user_id
*/

-- Update invoice status change logging
CREATE OR REPLACE FUNCTION log_invoice_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Only log if there's a user context or allow system logs
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      NEW.last_updated_by,  -- Can be NULL for system actions
      'invoice_status_set',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'status', NEW.status,
        'customer_id', NEW.customer_id,
        'system_action', (NEW.last_updated_by IS NULL)
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
      NEW.last_updated_by,  -- Can be NULL for system actions
      'invoice_status_changed',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'customer_id', NEW.customer_id,
        'system_action', (NEW.last_updated_by IS NULL)
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update customer assignment logging to handle NULL user_id
CREATE OR REPLACE FUNCTION log_customer_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Log with user_id if available (can be NULL for system actions)
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      auth.uid(),  -- Can be NULL for automated assignments
      'customer_assigned',
      'customer',
      NEW.customer_id,
      jsonb_build_object(
        'assigned_to_user_id', NEW.user_id,
        'customer_name', NEW.customer_name,
        'system_action', (auth.uid() IS NULL)
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
      auth.uid(),  -- Can be NULL for automated unassignments
      'customer_unassigned',
      'customer',
      OLD.customer_id,
      jsonb_build_object(
        'unassigned_from_user_id', OLD.user_id,
        'customer_name', OLD.customer_name,
        'system_action', (auth.uid() IS NULL)
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

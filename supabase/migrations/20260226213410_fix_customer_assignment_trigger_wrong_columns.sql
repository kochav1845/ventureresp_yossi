/*
  # Fix customer assignment activity log trigger

  The `log_customer_assignment_change` trigger references columns
  (`user_id`, `customer_name`) that do not exist on `customer_assignments`.
  This migration rewrites the function to use the correct columns:
  `customer_id`, `formula_id`, `template_id`.

  1. Changes
    - Rewrites `log_customer_assignment_change()` to reference valid columns
*/

CREATE OR REPLACE FUNCTION log_customer_assignment_change()
RETURNS TRIGGER AS $$
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
      auth.uid(),
      'customer_assigned',
      'customer_assignment',
      NEW.id,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'formula_id', NEW.formula_id,
        'template_id', NEW.template_id,
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
      auth.uid(),
      'customer_unassigned',
      'customer_assignment',
      OLD.id,
      jsonb_build_object(
        'customer_id', OLD.customer_id,
        'formula_id', OLD.formula_id,
        'template_id', OLD.template_id,
        'system_action', (auth.uid() IS NULL)
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
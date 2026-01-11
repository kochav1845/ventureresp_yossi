/*
  # Fix Customer Exclusion Logging Function

  1. Changes
    - Update log_customer_exclusion_changes() function to use correct column name
    - Change "action" to "action_type" to match user_activity_logs table schema

  2. Notes
    - This fixes the 400 error when excluding customers from analytics
*/

CREATE OR REPLACE FUNCTION log_customer_exclusion_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when payment analytics exclusion changes
  IF (OLD.exclude_from_payment_analytics IS DISTINCT FROM NEW.exclude_from_payment_analytics) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.excluded_by,
      CASE WHEN NEW.exclude_from_payment_analytics THEN 'exclude_from_analytics' ELSE 'include_in_analytics' END,
      'customer',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'analytics_type', 'payment',
        'excluded', NEW.exclude_from_payment_analytics,
        'notes', NEW.exclusion_notes
      )
    );
  END IF;

  -- Log when invoice analytics exclusion changes
  IF (OLD.exclude_from_invoice_analytics IS DISTINCT FROM NEW.exclude_from_invoice_analytics) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.excluded_by,
      CASE WHEN NEW.exclude_from_invoice_analytics THEN 'exclude_from_analytics' ELSE 'include_in_analytics' END,
      'customer',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'analytics_type', 'invoice',
        'excluded', NEW.exclude_from_invoice_analytics,
        'notes', NEW.exclusion_notes
      )
    );
  END IF;

  -- Log when customer analytics exclusion changes
  IF (OLD.exclude_from_customer_analytics IS DISTINCT FROM NEW.exclude_from_customer_analytics) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.excluded_by,
      CASE WHEN NEW.exclude_from_customer_analytics THEN 'exclude_from_analytics' ELSE 'include_in_analytics' END,
      'customer',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'analytics_type', 'customer',
        'excluded', NEW.exclude_from_customer_analytics,
        'notes', NEW.exclusion_notes
      )
    );
  END IF;

  -- Log when revenue analytics exclusion changes
  IF (OLD.exclude_from_revenue_analytics IS DISTINCT FROM NEW.exclude_from_revenue_analytics) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.excluded_by,
      CASE WHEN NEW.exclude_from_revenue_analytics THEN 'exclude_from_analytics' ELSE 'include_in_analytics' END,
      'customer',
      NEW.id::text,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'customer_name', NEW.customer_name,
        'analytics_type', 'revenue',
        'excluded', NEW.exclude_from_revenue_analytics,
        'notes', NEW.exclusion_notes
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  # Fix Customer Exclusion Logging - Handle NULL user_id

  1. Problem
    - The log_customer_exclusion_changes trigger is trying to insert NULL user_id
    - This happens when excluded_by is NULL
    - The user_activity_logs table requires a non-null user_id

  2. Solution
    - Only log if excluded_by is not NULL
    - Or use auth.uid() as fallback if excluded_by is NULL
    - This prevents the trigger from failing

  3. Changes
    - Add NULL check before inserting into user_activity_logs
    - Use COALESCE to try excluded_by first, then auth.uid()
*/

CREATE OR REPLACE FUNCTION log_customer_exclusion_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if we have a valid user_id (either from excluded_by or auth.uid())
  -- Skip logging if both are NULL to prevent constraint violations
  
  -- Log when payment analytics exclusion changes
  IF (OLD.exclude_from_payment_analytics IS DISTINCT FROM NEW.exclude_from_payment_analytics) 
     AND (NEW.excluded_by IS NOT NULL OR auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      COALESCE(NEW.excluded_by, auth.uid()),
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
  IF (OLD.exclude_from_invoice_analytics IS DISTINCT FROM NEW.exclude_from_invoice_analytics)
     AND (NEW.excluded_by IS NOT NULL OR auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      COALESCE(NEW.excluded_by, auth.uid()),
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
  IF (OLD.exclude_from_customer_analytics IS DISTINCT FROM NEW.exclude_from_customer_analytics)
     AND (NEW.excluded_by IS NOT NULL OR auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      COALESCE(NEW.excluded_by, auth.uid()),
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
  IF (OLD.exclude_from_revenue_analytics IS DISTINCT FROM NEW.exclude_from_revenue_analytics)
     AND (NEW.excluded_by IS NOT NULL OR auth.uid() IS NOT NULL) THEN
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      COALESCE(NEW.excluded_by, auth.uid()),
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
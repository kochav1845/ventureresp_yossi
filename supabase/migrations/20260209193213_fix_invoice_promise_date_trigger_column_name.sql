/*
  # Fix Invoice Promise Date Trigger Column Name

  1. Changes
    - Update trigger function to use correct column name 'promise_date' instead of 'promise_to_pay_date'
  
  2. Notes
    - Fixes error: "record 'old' has no field 'promise_to_pay_date'"
*/

CREATE OR REPLACE FUNCTION log_invoice_promise_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.promise_date IS DISTINCT FROM NEW.promise_date AND auth.uid() IS NOT NULL) THEN
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
        'old_promise_date', OLD.promise_date,
        'new_promise_date', NEW.promise_date,
        'balance', NEW.balance
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

/*
  # Fix invoice memo activity logging trigger

  1. Changes
    - Update log_invoice_memo_activity() function to use correct column names
    - Change user_id to created_by_user_id
    - Change attachment_url to has_image or has_voice_note
*/

CREATE OR REPLACE FUNCTION log_invoice_memo_activity()
RETURNS trigger
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
      NEW.created_by_user_id,
      'memo_added',
      'invoice',
      NEW.invoice_reference,
      jsonb_build_object(
        'memo_text', LEFT(NEW.memo_text, 100),
        'has_attachment', (NEW.has_image OR NEW.has_voice_note),
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
      NEW.created_by_user_id,
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
      OLD.created_by_user_id,
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
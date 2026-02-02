/*
  # Log Invoice Memo Creation to Ticket Activity

  1. Issue
    - When a memo is added to an invoice that belongs to a ticket
    - The ticket's "Last Activity" section doesn't update
    - Only user_activity_logs is updated, not ticket_activity_log

  2. Solution
    - Create trigger that checks if invoice is part of any ticket
    - Automatically log memo creation to ticket_activity_log
    - Include attachment type information in the description

  3. Notes
    - Logs for all tickets that contain the invoice
    - Provides detailed description including attachment type
    - Updates ticket's last activity timestamp
*/

-- Function to log invoice memo creation to ticket activity
CREATE OR REPLACE FUNCTION log_invoice_memo_to_ticket_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
  v_description text;
  v_attachment_info text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Build description based on attachment type
    IF NEW.has_voice_note AND NEW.has_image THEN
      v_attachment_info := ' (with voice note and image)';
    ELSIF NEW.has_voice_note THEN
      v_attachment_info := ' (with voice note)';
    ELSIF NEW.has_image THEN
      v_attachment_info := ' (with image)';
    ELSIF NEW.document_urls IS NOT NULL AND array_length(NEW.document_urls, 1) > 0 THEN
      v_attachment_info := ' (with ' || array_length(NEW.document_urls, 1) || ' document(s))';
    ELSE
      v_attachment_info := '';
    END IF;

    -- Build base description
    IF NEW.memo_text IS NOT NULL AND NEW.memo_text != '' THEN
      v_description := LEFT(NEW.memo_text, 100) || v_attachment_info;
    ELSE
      v_description := 'Memo added' || v_attachment_info;
    END IF;

    -- Find all tickets that contain this invoice and log activity
    FOR v_ticket_id IN 
      SELECT DISTINCT ticket_id 
      FROM ticket_invoices 
      WHERE invoice_reference_number = NEW.invoice_reference
    LOOP
      INSERT INTO ticket_activity_log (
        ticket_id,
        activity_type,
        description,
        created_by,
        metadata
      )
      VALUES (
        v_ticket_id,
        'note',
        v_description,
        NEW.created_by_user_id,
        jsonb_build_object(
          'memo_id', NEW.id,
          'invoice_reference', NEW.invoice_reference,
          'has_voice_note', NEW.has_voice_note,
          'has_image', NEW.has_image,
          'has_documents', CASE WHEN NEW.document_urls IS NOT NULL THEN array_length(NEW.document_urls, 1) ELSE 0 END,
          'attachment_type', NEW.attachment_type
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on invoice_memos
DROP TRIGGER IF EXISTS trigger_log_invoice_memo_to_ticket ON invoice_memos;
CREATE TRIGGER trigger_log_invoice_memo_to_ticket
  AFTER INSERT ON invoice_memos
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_memo_to_ticket_activity();

/*
  # Create delete_extra_invoice function

  1. New Functions
    - `delete_extra_invoice` - Deletes an invoice from the DB that no longer exists in Acumatica
      - Takes reference_number and type as parameters
      - Deletes all dependent records first (FK constraints):
        - invoice_change_log
        - invoice_activity_log
        - invoice_reminders
        - user_reminder_notifications
        - invoice_status_changes
        - invoice_memos
        - invoice_collector_assignments
      - Then deletes the invoice itself
      - Returns number of invoices deleted (0 or 1)
      - SECURITY DEFINER to bypass RLS for cleanup operations

  2. Purpose
    - Allows administrators to clean up "extra" invoices in the DB
      that no longer exist in Acumatica (e.g., deleted or voided upstream)
    - Used by the InvoiceBreakdown component when comparison shows DB > Acumatica
*/

CREATE OR REPLACE FUNCTION delete_extra_invoice(p_reference_number text, p_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_deleted integer := 0;
BEGIN
  SELECT id INTO v_invoice_id
  FROM acumatica_invoices
  WHERE reference_number = p_reference_number
  AND type = p_type;

  IF v_invoice_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM invoice_change_log WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_activity_log WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_reminders WHERE invoice_id = v_invoice_id;
  DELETE FROM user_reminder_notifications WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_status_changes WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_memos WHERE invoice_id = v_invoice_id;
  DELETE FROM invoice_collector_assignments WHERE invoice_id = v_invoice_id;

  DELETE FROM acumatica_invoices
  WHERE id = v_invoice_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

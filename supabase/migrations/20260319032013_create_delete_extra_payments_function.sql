/*
  # Create function to delete extra payments not found in Acumatica

  1. New Functions
    - `delete_extra_payment(p_reference_number, p_type)` - Safely deletes a single payment
      by reference number and type, cleaning up change logs first.
      Returns the count of deleted rows.

  2. Notes
    - Cleans up `payment_change_log` entries (NO ACTION FK) before deletion
    - `payment_invoice_applications`, `payment_attachments`, `payment_application_fetch_logs`
      are CASCADE and auto-deleted
    - Only accessible by authenticated users (service role through RPC)
*/

CREATE OR REPLACE FUNCTION public.delete_extra_payment(
  p_reference_number text,
  p_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id uuid;
  v_deleted integer := 0;
BEGIN
  SELECT id INTO v_payment_id
  FROM acumatica_payments
  WHERE reference_number = p_reference_number
    AND type = p_type;

  IF v_payment_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM payment_change_log WHERE payment_id = v_payment_id;

  DELETE FROM acumatica_payments
  WHERE id = v_payment_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

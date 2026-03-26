/*
  # Fix delete_extra_payment to handle all foreign key dependencies

  1. Changes
    - Updated `delete_extra_payment` function to delete from ALL dependent tables before deleting the payment
    - Now deletes from: payment_invoice_applications, payment_change_log, payment_attachments, payment_application_fetch_logs
    - Prevents foreign key constraint violations when deleting payments

  2. Important Notes
    - Previously only deleted from payment_change_log, causing FK violations
    - Uses payment_id (UUID) for all dependent table deletions
*/

CREATE OR REPLACE FUNCTION delete_extra_payment(p_reference_number text, p_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  DELETE FROM payment_invoice_applications WHERE payment_id = v_payment_id;
  DELETE FROM payment_change_log WHERE payment_id = v_payment_id;
  DELETE FROM payment_attachments WHERE payment_id = v_payment_id;
  DELETE FROM payment_application_fetch_logs WHERE payment_id = v_payment_id;

  DELETE FROM acumatica_payments
  WHERE id = v_payment_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
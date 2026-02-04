/*
  # Fix Reminders to Support invoice_reference_number Field

  1. Changes
    - Update get_todays_active_reminders function to join on invoice_reference_number
    - Return invoice_reference_number directly from table when invoice_id is null

  2. Reason
    - Reminders can be created with invoice_reference_number instead of invoice_id
    - Function needs to support both methods of linking to invoices
*/

-- Update function to support invoice_reference_number
CREATE OR REPLACE FUNCTION get_todays_active_reminders(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  invoice_id uuid,
  ticket_id uuid,
  reminder_date timestamptz,
  title text,
  priority text,
  reminder_type text,
  notes text,
  invoice_reference text,
  ticket_number text,
  customer_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ir.id,
    ir.invoice_id,
    ir.ticket_id,
    ir.reminder_date,
    ir.title,
    ir.priority,
    ir.reminder_type,
    ir.notes,
    COALESCE(ir.invoice_reference_number, ai.reference_number) as invoice_reference,
    ct.ticket_number,
    COALESCE(ct.customer_name, ai.customer_name) as customer_name
  FROM invoice_reminders ir
  LEFT JOIN acumatica_invoices ai ON (ir.invoice_id = ai.id OR ir.invoice_reference_number = ai.reference_number)
  LEFT JOIN collection_tickets ct ON ir.ticket_id = ct.id
  WHERE ir.user_id = p_user_id
    AND ir.completed_at IS NULL
    AND ir.status != 'completed'
    AND DATE(ir.reminder_date AT TIME ZONE 'UTC') <= CURRENT_DATE
  ORDER BY ir.priority DESC, ir.reminder_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
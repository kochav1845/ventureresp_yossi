/*
  # Fix get_todays_active_reminders Function

  1. Changes
    - Drop and recreate function to use `title` instead of deprecated `reminder_message` column
    - Add ticket_id and ticket_number fields to support ticket links
    - Join with collection_tickets table for ticket information

  2. Reason
    - The reminder_message column was removed in a previous migration
    - Users need to see and click links to associated tickets
    - Ensures consistency across the application
*/

-- Drop the old function
DROP FUNCTION IF EXISTS get_todays_active_reminders(uuid);

-- Recreate with updated schema
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
    ai.reference_number as invoice_reference,
    ct.ticket_number,
    COALESCE(ct.customer_name, ai.customer_name) as customer_name
  FROM invoice_reminders ir
  LEFT JOIN acumatica_invoices ai ON ir.invoice_id = ai.id
  LEFT JOIN collection_tickets ct ON ir.ticket_id = ct.id
  WHERE ir.user_id = p_user_id
    AND ir.completed_at IS NULL
    AND DATE(ir.reminder_date AT TIME ZONE 'UTC') <= CURRENT_DATE
  ORDER BY ir.priority DESC, ir.reminder_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
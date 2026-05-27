/*
  # Create fast collector calendar data function

  1. Purpose
    - Single RPC call returns ALL calendar data for a collector in a date range
    - Returns promises, reminders, and notes as JSON arrays per day
    - Uses indexed lookups on user_id + date columns for maximum speed
    - Designed to return in under 50ms

  2. Returns
    - JSON object with promises array, reminders array, and notes array
    - Each pre-formatted for direct frontend consumption

  3. Performance
    - Uses direct index scans on (assigned_collector_id, promise_date) and (user_id, reminder_date)
    - No expensive joins - ticket invoice balances calculated via lateral subquery
    - Statement timeout of 3 seconds as safety net
*/

CREATE OR REPLACE FUNCTION get_collector_calendar_data(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '3s'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'promises', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ticket_id', t.id,
        'ticket_number', t.ticket_number,
        'customer_name', t.customer_name,
        'promise_date', t.promise_date::text,
        'ticket_status', t.status,
        'total_balance', COALESCE(inv_totals.total_bal, 0)
      ) ORDER BY t.promise_date)
      FROM collection_tickets t
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ai.balance), 0) as total_bal
        FROM collection_ticket_invoices cti
        JOIN acumatica_invoices ai ON ai.id = cti.invoice_id
        WHERE cti.ticket_id = t.id
      ) inv_totals ON true
      WHERE t.assigned_collector_id = p_user_id
        AND t.promise_date IS NOT NULL
        AND t.promise_date::date >= p_start_date
        AND t.promise_date::date <= p_end_date
    ), '[]'::jsonb),
    'reminders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reminder_date', r.reminder_date::text,
        'reminder_message', COALESCE(r.title, r.reminder_message, ''),
        'is_triggered', r.is_triggered
      ) ORDER BY r.reminder_date)
      FROM invoice_reminders r
      WHERE r.user_id = p_user_id
        AND r.reminder_date::date >= p_start_date
        AND r.reminder_date::date <= p_end_date
    ), '[]'::jsonb),
    'notes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id,
        'note_date', n.note_date::text,
        'content', n.content
      ) ORDER BY n.note_date)
      FROM collector_calendar_notes n
      WHERE n.user_id = p_user_id
        AND n.note_date >= p_start_date
        AND n.note_date <= p_end_date
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Add index on collection_tickets for promise date lookups
CREATE INDEX IF NOT EXISTS idx_collection_tickets_collector_promise
  ON collection_tickets(assigned_collector_id, promise_date)
  WHERE promise_date IS NOT NULL;

-- Add index on invoice_reminders for date range lookups
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_user_date
  ON invoice_reminders(user_id, reminder_date);

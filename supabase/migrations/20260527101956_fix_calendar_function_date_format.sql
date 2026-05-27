/*
  # Fix calendar function date format for reminders

  1. Changes
    - Cast reminder_date to ISO 8601 format with T separator
    - Ensures frontend can split on 'T' to get date key
    - Use to_char for consistent formatting
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
        'promise_date', to_char(t.promise_date, 'YYYY-MM-DD"T"HH24:MI:SS'),
        'ticket_status', t.status,
        'total_balance', COALESCE(inv_totals.total_bal, 0)
      ) ORDER BY t.promise_date)
      FROM collection_tickets t
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ai.balance), 0) as total_bal
        FROM ticket_invoices ti
        JOIN acumatica_invoices ai ON ai.reference_number = ti.invoice_reference_number
        WHERE ti.ticket_id = t.id
      ) inv_totals ON true
      WHERE t.assigned_collector_id = p_user_id
        AND t.promise_date IS NOT NULL
        AND t.promise_date::date >= p_start_date
        AND t.promise_date::date <= p_end_date
    ), '[]'::jsonb),
    'reminders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reminder_date', to_char(r.reminder_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
        'reminder_message', COALESCE(r.title, r.description, ''),
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

/*
  # Add email schedules to collector calendar data

  1. Changes
    - Updates `get_collector_calendar_data` to include active email assignments
      linked to the collector's tickets
    - Returns assignment_id, customer_name, formula schedule, and ticket info

  2. Notes
    - Email schedule dates are computed client-side based on the formula schedule JSON
    - Only returns active assignments where the source ticket is assigned to this collector
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
SET statement_timeout = '5s'
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
    ), '[]'::jsonb),
    'email_schedules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'assignment_id', ca.id,
        'customer_name', c.name,
        'customer_email', c.email,
        'formula_name', ef.name,
        'formula_schedule', ef.schedule,
        'ticket_number', ca.source_ticket_number,
        'ticket_id', ca.source_ticket_id,
        'is_active', ca.is_active
      ))
      FROM customer_assignments ca
      JOIN customers c ON c.id = ca.customer_id
      JOIN email_formulas ef ON ef.id = ca.formula_id
      WHERE ca.is_active = true
        AND ca.source_ticket_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM collection_tickets ct
          WHERE ct.id = ca.source_ticket_id
            AND ct.assigned_collector_id = p_user_id
        )
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

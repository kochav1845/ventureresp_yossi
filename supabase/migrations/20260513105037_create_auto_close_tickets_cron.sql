/*
  # Auto-close tickets with no unpaid invoices (cron job)

  1. New Functions
    - `auto_close_tickets_with_no_unpaid_invoices()` - Finds all non-closed tickets
      where every linked invoice is either paid (balance <= 0), closed, or voided,
      and also tickets with zero invoices linked. Closes them automatically.

  2. Cron
    - Runs every 10 minutes to catch any tickets the trigger missed

  3. Notes
    - The existing trigger on `acumatica_invoices` handles most cases in real-time
    - This cron is a safety net for edge cases: bulk syncs, direct DB updates,
      invoices arriving already closed from Acumatica, tickets with removed invoices
    - Sets status to 'closed' and resolved_at to now()
    - The existing trigger `log_ticket_status_change` will automatically log
      the status change to ticket_status_history and ticket_activity_log
*/

CREATE OR REPLACE FUNCTION auto_close_tickets_with_no_unpaid_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_count integer := 0;
  v_closed_tickets text[] := '{}';
  v_ticket record;
BEGIN
  FOR v_ticket IN
    SELECT ct.id, ct.ticket_number, ct.customer_name
    FROM collection_tickets ct
    WHERE ct.status NOT IN ('closed')
      AND NOT EXISTS (
        SELECT 1
        FROM ticket_invoices ti
        JOIN acumatica_invoices ai
          ON ai.reference_number = ti.invoice_reference_number
        WHERE ti.ticket_id = ct.id
          AND ai.balance > 0
          AND ai.status NOT IN ('Closed', 'Voided')
      )
  LOOP
    UPDATE collection_tickets
    SET status = 'closed',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_ticket.id
      AND status != 'closed';

    IF FOUND THEN
      v_closed_count := v_closed_count + 1;
      v_closed_tickets := array_append(v_closed_tickets, v_ticket.ticket_number);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'closed_count', v_closed_count,
    'closed_tickets', to_jsonb(v_closed_tickets),
    'run_at', now()
  );
END;
$$;

-- Run every 10 minutes
SELECT cron.schedule(
  'auto-close-paid-tickets',
  '*/10 * * * *',
  $$SELECT auto_close_tickets_with_no_unpaid_invoices();$$
);

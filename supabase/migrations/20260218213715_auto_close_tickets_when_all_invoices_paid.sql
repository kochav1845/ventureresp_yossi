/*
  # Auto-close tickets when all invoices are paid

  1. Changes
    - Replace `remove_closed_invoice_from_tickets` function
    - OLD behavior: deleted paid invoices from `ticket_invoices`, severing the link
    - NEW behavior: keeps paid invoices on the ticket so they remain visible
    - When ALL invoices on a ticket become paid/closed, automatically sets ticket status to 'closed'
    - The existing `log_ticket_status_change` trigger on `collection_tickets` will log the status change
      to `ticket_status_history` and `ticket_activity_log` automatically

  2. Why
    - Users want to see paid invoices on tickets for historical context
    - Tickets should auto-close when there is nothing left to collect
    - Closed tickets move to the "Closed" tab in the UI

  3. Important Notes
    - The trigger still fires on `acumatica_invoices` AFTER UPDATE when status='Closed' or balance<=0
    - Paid invoices remain in `ticket_invoices` and `invoice_assignments` for display
    - The ticket status change triggers existing audit logging automatically
*/

CREATE OR REPLACE FUNCTION remove_closed_invoice_from_tickets()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket RECORD;
  v_unpaid_count int;
BEGIN
  IF (NEW.status = 'Closed' OR NEW.balance <= 0) AND
     (OLD.status != 'Closed' OR OLD.balance > 0) THEN

    FOR v_ticket IN
      SELECT DISTINCT ti.ticket_id
      FROM ticket_invoices ti
      JOIN collection_tickets ct ON ct.id = ti.ticket_id
      WHERE ti.invoice_reference_number = NEW.reference_number
        AND ct.status != 'closed'
    LOOP
      SELECT COUNT(*) INTO v_unpaid_count
      FROM ticket_invoices ti
      JOIN acumatica_invoices ai ON ai.reference_number = ti.invoice_reference_number
      WHERE ti.ticket_id = v_ticket.ticket_id
        AND ai.reference_number != NEW.reference_number
        AND ai.status != 'Closed'
        AND ai.balance > 0;

      IF v_unpaid_count = 0 THEN
        UPDATE collection_tickets
        SET status = 'closed',
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_ticket.ticket_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

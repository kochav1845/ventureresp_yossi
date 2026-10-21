/*
  # auto_close_tickets_with_no_unpaid_invoices() closed EVERY ticket

  The job looked for a ticket's invoices in `ticket_invoices`. The app has never
  put them there -- creating a ticket, and adding invoices to one, both write to
  `invoice_assignments`. All 4 live tickets have rows in invoice_assignments and
  zero in ticket_invoices.

  So `NOT EXISTS (... ticket_invoices ...)` was trivially true for every ticket,
  and the job -- which runs every 10 minutes -- closed all of them regardless of
  what they actually owed. TKT000001 has 9 invoices, all 9 unpaid, and was still
  being closed. Reopening a ticket by hand held for at most ten minutes before
  the next run reverted it; every live ticket's resolved_at lands exactly on a
  cron minute (:58, :28), so not one of them was closed by a person.

  Two changes:

  - Look at BOTH link tables. invoice_assignments is what the app writes;
    ticket_invoices still holds 778 older rows, so both count.
  - Only auto-close a ticket that actually HAS a linked invoice. Previously a
    ticket with no invoices at all satisfied "no unpaid invoices" and was closed
    within ten minutes of being created -- including before anyone had attached
    anything to it.
*/

CREATE OR REPLACE FUNCTION public.auto_close_tickets_with_no_unpaid_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_closed_count integer := 0;
  v_closed_tickets text[] := '{}';
  v_ticket record;
BEGIN
  FOR v_ticket IN
    WITH linked AS (
      -- Every invoice attached to a ticket, by whichever table holds the link.
      SELECT ia.ticket_id, ia.invoice_reference_number
        FROM invoice_assignments ia
       WHERE ia.ticket_id IS NOT NULL
      UNION
      SELECT ti.ticket_id, ti.invoice_reference_number
        FROM ticket_invoices ti
       WHERE ti.ticket_id IS NOT NULL
    ),
    per_ticket AS (
      SELECT l.ticket_id,
             count(*) AS linked_invoices,
             count(*) FILTER (
               WHERE ai.balance > 0 AND ai.status NOT IN ('Closed', 'Voided')
             ) AS unpaid_invoices
        FROM linked l
        JOIN acumatica_invoices ai
          ON ai.reference_number = l.invoice_reference_number
       GROUP BY l.ticket_id
    )
    SELECT ct.id, ct.ticket_number, ct.customer_name
      FROM collection_tickets ct
      JOIN per_ticket p ON p.ticket_id = ct.id
     WHERE ct.status NOT IN ('closed')
       AND p.linked_invoices > 0      -- never close a ticket with nothing on it
       AND p.unpaid_invoices = 0      -- everything it covers is settled
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
$function$;

/*
  # delete_tickets(uuid[]) — remove tickets without leaving debris

  Deleting a ticket from the client left orphans and could half-fail:

  - invoice_assignments.ticket_id and invoice_reminders.ticket_id are both
    ON DELETE SET NULL, so the rows SURVIVE the ticket with a null ticket_id.
    Assignments in that state resurface as "individual assignments" on their own
    tab, and reminders linger in the Reminders list pointing at a ticket that no
    longer exists.
  - The DELETE policies disagree about who may do what: anyone in the org may
    delete a collection_ticket, but only an admin or manager may delete an
    invoice_assignment. A collector deleting a ticket would therefore remove the
    ticket and silently fail to remove its assignments.

  This does the whole job in one transaction, as the definer, so the outcome
  doesn't depend on which of those policies the caller happens to satisfy.
  Org scoping is enforced here explicitly: tickets outside the caller's
  organization are ignored, never deleted.

  Everything else hanging off a ticket (ticket_notes, ticket_memos,
  ticket_activity_log, ticket_status_history, ticket_invoices,
  ticket_email_threads, ticket_merge_events) is already ON DELETE CASCADE and
  needs no help. ticket_email_actions is NO ACTION and would block the delete,
  so its rows are detached first.

  Returns one row of counts so the caller can report what actually happened.
*/

CREATE OR REPLACE FUNCTION public.delete_tickets(p_ticket_ids uuid[])
RETURNS TABLE(
  tickets_deleted integer,
  assignments_deleted integer,
  reminders_deleted integer,
  skipped_other_org integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org   uuid := get_user_org_id();
  v_ids   uuid[];
  v_t int := 0; v_a int := 0; v_r int := 0; v_skip int := 0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'delete_tickets: no organization for the current user';
  END IF;

  -- Only ever touch tickets in the caller's own organization.
  SELECT COALESCE(array_agg(id), '{}')
    INTO v_ids
    FROM collection_tickets
   WHERE id = ANY(p_ticket_ids)
     AND organization_id = v_org;

  SELECT COALESCE(array_length(p_ticket_ids, 1), 0) - COALESCE(array_length(v_ids, 1), 0)
    INTO v_skip;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, v_skip;
    RETURN;
  END IF;

  -- NO ACTION FK: detach rather than block.
  UPDATE ticket_email_actions SET ticket_id = NULL WHERE ticket_id = ANY(v_ids);

  WITH d AS (DELETE FROM invoice_assignments WHERE ticket_id = ANY(v_ids) RETURNING 1)
  SELECT count(*)::int INTO v_a FROM d;

  WITH d AS (DELETE FROM invoice_reminders WHERE ticket_id = ANY(v_ids) RETURNING 1)
  SELECT count(*)::int INTO v_r FROM d;

  WITH d AS (DELETE FROM collection_tickets WHERE id = ANY(v_ids) RETURNING 1)
  SELECT count(*)::int INTO v_t FROM d;

  RETURN QUERY SELECT v_t, v_a, v_r, v_skip;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_tickets(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

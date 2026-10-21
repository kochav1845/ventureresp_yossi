/*
  # Hand a user's work to someone else, then delete them -- in one transaction

  force-delete-user refuses to delete a user who still holds work, because
  several tables reference user_profiles ON DELETE CASCADE / SET NULL and the
  delete would destroy it. The sharp one is invoice_assignments: it is what
  puts invoices on tickets (and on the Invoices tab), so deleting a collector
  stripped their invoices off every ticket. Live examples when this was
  written: the demo collector David Thompson held 362 invoice assignments, 80
  tickets, 80 ticket_collectors rows and 92 customer assignments.

  This moves every piece of that work to p_to and then deletes the auth user,
  all or nothing. If anything fails -- including the 37 NO ACTION history FKs
  (notes, memos, status changes...) that block deleting a user with history --
  the whole call rolls back and nothing has moved.

  Order matters:
  - collection_tickets first. Its triggers do part of the job:
    sync_ticket_collector_change moves the ticket's invoice_assignments that
    were the old collector's, and sync_primary_ticket_collector makes p_to the
    primary in ticket_collectors.
  - Tables with a UNIQUE that includes the collector (ticket_collectors,
    collector_customer_assignments, collector_assignments) drop the old row
    where p_to already has one, so the UPDATE that follows can't collide.
  - request.jwt.claims is set to the acting admin for the transaction, so the
    ticket triggers' activity rows (COALESCE(auth.uid(), new collector)) credit
    the admin who did it rather than the person receiving the work.

  Service role only: the edge function does the authorization (admin, same
  organization, eligible recipient). The org checks are repeated here anyway.
*/

CREATE OR REPLACE FUNCTION public.reassign_and_delete_user(p_user uuid, p_to uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_org uuid;
  v_to_org uuid;
  v_moved jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF p_to IS NULL OR p_to = p_user THEN
    RAISE EXCEPTION 'Pick someone else to take over the work';
  END IF;
  SELECT organization_id INTO v_org FROM user_profiles WHERE id = p_user;
  SELECT organization_id INTO v_to_org FROM user_profiles WHERE id = p_to;
  IF v_to_org IS NULL OR v_to_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'The person taking over must be in the same organization';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'service_role')::text, true);

  UPDATE collection_tickets SET assigned_collector_id = p_to WHERE assigned_collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tickets', n);

  -- Whatever the ticket trigger didn't carry: invoices on other people's
  -- tickets, and individual (ticketless) assignments.
  UPDATE invoice_assignments SET assigned_collector_id = p_to WHERE assigned_collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('invoices', n);

  -- Shared tickets. Where p_to is already on the ticket, keep p_to's row and
  -- carry the primary flag over.
  UPDATE ticket_collectors tc SET is_primary = true
    FROM ticket_collectors old
   WHERE old.collector_id = p_user AND old.is_primary
     AND tc.ticket_id = old.ticket_id AND tc.collector_id = p_to;
  DELETE FROM ticket_collectors old
   WHERE old.collector_id = p_user
     AND EXISTS (SELECT 1 FROM ticket_collectors x WHERE x.ticket_id = old.ticket_id AND x.collector_id = p_to);
  UPDATE ticket_collectors SET collector_id = p_to WHERE collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('shared_tickets', n);

  DELETE FROM collector_customer_assignments a
   WHERE a.assigned_collector_id = p_user
     AND EXISTS (SELECT 1 FROM collector_customer_assignments b WHERE b.customer_id = a.customer_id AND b.assigned_collector_id = p_to);
  UPDATE collector_customer_assignments SET assigned_collector_id = p_to WHERE assigned_collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('customers', n);

  DELETE FROM collector_assignments a
   WHERE a.collector_id = p_user
     AND EXISTS (SELECT 1 FROM collector_assignments b WHERE b.customer_id = a.customer_id AND b.collector_id = p_to);
  UPDATE collector_assignments SET collector_id = p_to WHERE collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('collector_assignments', n);

  UPDATE invoice_collector_assignments SET collector_id = p_to WHERE collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('invoice_collector_assignments', n);

  UPDATE collector_email_schedules SET collector_id = p_to WHERE collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('email_schedules', n);

  UPDATE auto_ticket_rules SET assigned_collector_id = p_to WHERE assigned_collector_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('auto_rules', n);
  -- Rules they wrote keep running; the admin doing the delete now owns them.
  UPDATE auto_ticket_rules SET created_by = p_actor WHERE created_by = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('auto_rules_created', n);

  -- Follow-ups on the invoices being handed over would otherwise cascade away.
  UPDATE invoice_reminders SET user_id = p_to WHERE user_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('reminders', n);

  -- user_profiles.id cascades from auth.users, so this removes login and profile together.
  DELETE FROM auth.users WHERE id = p_user;

  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_and_delete_user(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_and_delete_user(uuid, uuid, uuid) TO service_role;

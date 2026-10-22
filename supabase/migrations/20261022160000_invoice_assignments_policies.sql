/*
  # invoice_assignments: no tenant scoping, and sharing ignored (audit 41)

  Found while fixing the swallowed upsert errors in the ticketing UI. Three
  problems in the policies on this table.

  1. NO ORGANIZATION SCOPING ANYWHERE. "Managers can view all invoice
     assignments" and "Admins can manage all invoice assignments" test only
     `user_profiles.role`, so a manager or admin in the demo organization --
     which anyone can sign up for on the public demo -- could read and modify
     the live organization's invoice-to-collector assignments. The table has no
     organization_id of its own, so the tenant is resolved through the assigned
     collector's profile; a collector belongs to exactly one organization.

  2. The role tests also ignored account_status, so a pending account with
     role='manager' satisfied them. is_admin() and is_manager_or_admin()
     already check for 'approved', so they are used instead.

  3. Ticket sharing was ignored. UPDATE required
     `assigned_collector_id = auth.uid()`, so a collector who shares a ticket
     through ticket_collectors could not move an invoice on it. That is what
     made the swallowed-error bug visible: the UI reported "Ticket created
     successfully" with an activity-log line claiming N invoices, while RLS had
     refused them and the ticket showed none. The UI now reports the refusal,
     and a collector the ticket is shared with is allowed to make the change.

  DELETE for managers keeps its own policy, now org-scoped and approval-aware.
*/

-- The tenant, resolved through the assigned collector.
CREATE OR REPLACE FUNCTION public.invoice_assignment_in_my_org(p_collector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = p_collector_id
      AND up.organization_id = get_user_org_id()
      AND get_user_org_id() IS NOT NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.invoice_assignment_in_my_org(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoice_assignment_in_my_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.invoice_assignment_in_my_org(uuid) TO authenticated, service_role;

-- Does the caller share the ticket this assignment hangs off?
CREATE OR REPLACE FUNCTION public.shares_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p_ticket_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ticket_collectors tc
    WHERE tc.ticket_id = p_ticket_id
      AND tc.collector_id = auth.uid()
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.shares_ticket(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_ticket(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_ticket(uuid) TO authenticated, service_role;

-- ── SELECT ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Collectors can view their assignments" ON public.invoice_assignments;
CREATE POLICY "Collectors can view their assignments"
  ON public.invoice_assignments FOR SELECT TO authenticated
  USING (
    assigned_collector_id = (SELECT auth.uid())
    OR shares_ticket(ticket_id)
  );

DROP POLICY IF EXISTS "Managers can view all invoice assignments" ON public.invoice_assignments;
CREATE POLICY "Managers can view their org's invoice assignments"
  ON public.invoice_assignments FOR SELECT TO authenticated
  USING (is_manager_or_admin() AND invoice_assignment_in_my_org(assigned_collector_id));

-- ── INSERT ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users with ticketing permission can create assignments" ON public.invoice_assignments;
CREATE POLICY "Users with ticketing permission can create assignments"
  ON public.invoice_assignments FOR INSERT TO authenticated
  WITH CHECK (
    user_has_permission(auth.uid(), 'collection_ticketing'::text, 'create'::text)
    AND invoice_assignment_in_my_org(assigned_collector_id)
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Collectors can update notes on their assignments" ON public.invoice_assignments;
CREATE POLICY "Collectors can update their own or shared assignments"
  ON public.invoice_assignments FOR UPDATE TO authenticated
  USING (
    assigned_collector_id = (SELECT auth.uid())
    OR shares_ticket(ticket_id)
  )
  WITH CHECK (invoice_assignment_in_my_org(assigned_collector_id));

DROP POLICY IF EXISTS "Managers can update invoice assignments" ON public.invoice_assignments;
CREATE POLICY "Managers can update their org's invoice assignments"
  ON public.invoice_assignments FOR UPDATE TO authenticated
  USING (is_manager_or_admin() AND invoice_assignment_in_my_org(assigned_collector_id))
  WITH CHECK (is_manager_or_admin() AND invoice_assignment_in_my_org(assigned_collector_id));

-- ── DELETE ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can delete invoice assignments" ON public.invoice_assignments;
CREATE POLICY "Managers can delete their org's invoice assignments"
  ON public.invoice_assignments FOR DELETE TO authenticated
  USING (is_manager_or_admin() AND invoice_assignment_in_my_org(assigned_collector_id));

-- ── Admin catch-all, now org-scoped and approval-aware ───────────────────
DROP POLICY IF EXISTS "Admins can manage all invoice assignments" ON public.invoice_assignments;
CREATE POLICY "Admins can manage their org's invoice assignments"
  ON public.invoice_assignments FOR ALL TO authenticated
  USING (is_admin() AND invoice_assignment_in_my_org(assigned_collector_id))
  WITH CHECK (is_admin() AND invoice_assignment_in_my_org(assigned_collector_id));

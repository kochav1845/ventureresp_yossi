/*
  # Share one ticket between several collectors

  collection_tickets.assigned_collector_id holds exactly one collector, so a
  ticket could only ever belong to one person. This adds a join table so a
  ticket can be worked by several, with every one of them seeing it under My
  Assignments.

  assigned_collector_id is KEPT and keeps its meaning: the primary collector.
  Plenty already depends on it -- invoice_assignments.assigned_collector_id is
  NOT NULL and is stamped from it, auto_close_tickets_with_no_unpaid_invoices,
  the ticket email paths, the collector dashboards. Rather than rewrite all of
  that, the primary stays authoritative and ticket_collectors carries the full
  set, the primary included. The trigger below keeps the two from drifting:
  setting or changing assigned_collector_id always leaves a matching row.

  Sharing is deliberately VISIBLE -- every collector list in the app shows all
  of them, so anyone looking at a ticket can tell it is shared and with whom.
*/

CREATE TABLE IF NOT EXISTS public.ticket_collectors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  collector_id  uuid NOT NULL REFERENCES user_profiles(id)      ON DELETE CASCADE,
  is_primary    boolean NOT NULL DEFAULT false,
  added_by      uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, collector_id)
);

COMMENT ON TABLE public.ticket_collectors IS
  'Every collector working a ticket, the primary included. collection_tickets.assigned_collector_id remains the primary and is mirrored here by trigger.';

CREATE INDEX IF NOT EXISTS idx_ticket_collectors_collector ON ticket_collectors (collector_id);
CREATE INDEX IF NOT EXISTS idx_ticket_collectors_ticket    ON ticket_collectors (ticket_id);

-- ── RLS: scoped through the parent ticket's organization ──────────────────

ALTER TABLE public.ticket_collectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org ticket collectors" ON ticket_collectors;
CREATE POLICY "Users can view own org ticket collectors"
  ON ticket_collectors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM collection_tickets t
                  WHERE t.id = ticket_collectors.ticket_id
                    AND t.organization_id = get_user_org_id()));

DROP POLICY IF EXISTS "Users can insert own org ticket collectors" ON ticket_collectors;
CREATE POLICY "Users can insert own org ticket collectors"
  ON ticket_collectors FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM collection_tickets t
                       WHERE t.id = ticket_collectors.ticket_id
                         AND t.organization_id = get_user_org_id()));

DROP POLICY IF EXISTS "Users can update own org ticket collectors" ON ticket_collectors;
CREATE POLICY "Users can update own org ticket collectors"
  ON ticket_collectors FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM collection_tickets t
                  WHERE t.id = ticket_collectors.ticket_id
                    AND t.organization_id = get_user_org_id()));

DROP POLICY IF EXISTS "Users can delete own org ticket collectors" ON ticket_collectors;
CREATE POLICY "Users can delete own org ticket collectors"
  ON ticket_collectors FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM collection_tickets t
                  WHERE t.id = ticket_collectors.ticket_id
                    AND t.organization_id = get_user_org_id()));

-- ── keep the primary mirrored into the join table ─────────────────────────

CREATE OR REPLACE FUNCTION public.sync_primary_ticket_collector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.assigned_collector_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Whoever used to be primary no longer is; they stay on the ticket.
  UPDATE ticket_collectors
     SET is_primary = false
   WHERE ticket_id = NEW.id
     AND collector_id <> NEW.assigned_collector_id
     AND is_primary;

  INSERT INTO ticket_collectors (ticket_id, collector_id, is_primary, added_by)
  VALUES (NEW.id, NEW.assigned_collector_id, true, NEW.created_by)
  ON CONFLICT (ticket_id, collector_id)
  DO UPDATE SET is_primary = true;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_primary_ticket_collector ON collection_tickets;
CREATE TRIGGER trg_sync_primary_ticket_collector
  AFTER INSERT OR UPDATE OF assigned_collector_id ON collection_tickets
  FOR EACH ROW EXECUTE FUNCTION sync_primary_ticket_collector();

-- ── backfill the tickets that already exist ───────────────────────────────

INSERT INTO ticket_collectors (ticket_id, collector_id, is_primary, added_by, added_at)
SELECT t.id, t.assigned_collector_id, true, t.created_by, COALESCE(t.assigned_at, t.created_at, now())
  FROM collection_tickets t
 WHERE t.assigned_collector_id IS NOT NULL
ON CONFLICT (ticket_id, collector_id) DO NOTHING;

/*
  Which tickets a collector can see under My Assignments.

  Two routes onto a ticket: being named in ticket_collectors, or holding one of
  its invoice_assignments. Doing this server-side keeps the client from having
  to fetch a membership list and splice it into two separate queries.
*/
CREATE OR REPLACE FUNCTION public.my_ticket_ids()
RETURNS TABLE(ticket_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT tc.ticket_id
    FROM ticket_collectors tc
    JOIN collection_tickets t ON t.id = tc.ticket_id
   WHERE tc.collector_id = auth.uid()
     AND t.organization_id = get_user_org_id()
  UNION
  SELECT ia.ticket_id
    FROM invoice_assignments ia
    JOIN collection_tickets t ON t.id = ia.ticket_id
   WHERE ia.assigned_collector_id = auth.uid()
     AND t.organization_id = get_user_org_id()
     AND ia.ticket_id IS NOT NULL;
$function$;

GRANT EXECUTE ON FUNCTION public.my_ticket_ids() TO authenticated;

NOTIFY pgrst, 'reload schema';

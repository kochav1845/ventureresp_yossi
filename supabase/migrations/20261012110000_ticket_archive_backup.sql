/*
  # One-off safety net before clearing the ticket history

  The tickets are about to be wiped so the system can start fresh for real use.
  Deleting a ticket also cascades its notes, memos, activity log, status history
  and ticket_invoices, and the RPC additionally clears its invoice assignments
  and reminders — none of which is recoverable.

  This snapshots every ticket with its children inlined as JSON into
  `ticket_archive_20261012`, so the history can still be read (or replayed)
  afterwards. Nothing references it; drop the table whenever you're confident
  it isn't needed:

      DROP TABLE public.ticket_archive_20261012;

  No RLS: it holds both organizations' history and is meant to be reachable
  only through the SQL editor / management API, not the app's anon or
  authenticated roles. Those roles are granted nothing on it.
*/

DROP TABLE IF EXISTS public.ticket_archive_20261012;

CREATE TABLE public.ticket_archive_20261012 AS
SELECT
  t.id,
  t.ticket_number,
  t.organization_id,
  t.customer_id,
  t.customer_name,
  t.status,
  t.created_at,
  to_jsonb(t)                                                     AS ticket,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM invoice_assignments   x WHERE x.ticket_id = t.id), '[]'::jsonb) AS invoice_assignments,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM invoice_reminders     x WHERE x.ticket_id = t.id), '[]'::jsonb) AS reminders,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ticket_notes          x WHERE x.ticket_id = t.id), '[]'::jsonb) AS notes,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ticket_memos          x WHERE x.ticket_id = t.id), '[]'::jsonb) AS memos,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ticket_activity_log   x WHERE x.ticket_id = t.id), '[]'::jsonb) AS activity_log,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ticket_status_history x WHERE x.ticket_id = t.id), '[]'::jsonb) AS status_history,
  COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ticket_invoices       x WHERE x.ticket_id = t.id), '[]'::jsonb) AS ticket_invoices,
  now() AS archived_at
FROM collection_tickets t;

CREATE INDEX ON public.ticket_archive_20261012 (organization_id);
CREATE INDEX ON public.ticket_archive_20261012 (ticket_number);

REVOKE ALL ON public.ticket_archive_20261012 FROM anon, authenticated;

COMMENT ON TABLE public.ticket_archive_20261012 IS
  'Snapshot of every collection_ticket and its children taken 2026-10-12, immediately before the ticket history was cleared for live use. Safe to DROP once no longer wanted.';

/*
  # Carry collection_tickets.updated_at into the ticket list

  The Ticketing System is gaining a sort control, and "date modified" is the one
  requested key whose data never reached the UI: get_ticket_enrichment_bulk
  returned created_at and resolved_at but not updated_at, and neither the
  collector_assignment_details view nor the empty-ticket query carries it
  either. Enrichment runs over every loaded ticket, so adding it here covers
  them all in one place.

  RETURNS TABLE is part of a function's identity, so this drops and recreates.
  The body is otherwise byte-identical to what was deployed.
*/

DROP FUNCTION IF EXISTS public.get_ticket_enrichment_bulk(p_ticket_ids uuid[]);

CREATE OR REPLACE FUNCTION public.get_ticket_enrichment_bulk(p_ticket_ids uuid[])
 RETURNS TABLE(ticket_id uuid, promise_date date, promise_by_user_name text, ticket_created_at timestamp with time zone, ticket_resolved_at timestamp with time zone, ticket_updated_at timestamp with time zone, last_status_change_status text, last_status_change_at timestamp with time zone, last_status_change_by text, last_activity_description text, last_activity_at timestamp with time zone, last_activity_by text, note_count bigint, has_note_attachments boolean, has_note_images boolean, has_note_documents boolean, last_note_text text, last_note_at timestamp with time zone, memo_count bigint, has_memo_attachments boolean, has_memo_images boolean, has_memo_documents boolean, last_memo_text text, last_memo_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
WITH ticket_base AS (
SELECT
ct.id,
ct.promise_date,
ct.created_at,
ct.resolved_at,
ct.updated_at,
COALESCE(up.full_name, up.email) as promise_by_user_name
FROM collection_tickets ct
LEFT JOIN user_profiles up ON up.id = ct.promise_by_user_id
WHERE ct.id = ANY(p_ticket_ids)
),
last_status_changes AS (
SELECT DISTINCT ON (tal.ticket_id)
tal.ticket_id,
tal.description,
tal.created_at,
COALESCE(up.full_name, up.email, 'Unknown') as changed_by
FROM ticket_activity_log tal
LEFT JOIN user_profiles up ON up.id = tal.created_by
WHERE tal.ticket_id = ANY(p_ticket_ids)
AND tal.activity_type = 'status_change'
ORDER BY tal.ticket_id, tal.created_at DESC
),
last_activities AS (
SELECT DISTINCT ON (tal.ticket_id)
tal.ticket_id,
tal.description,
tal.created_at,
COALESCE(up.full_name, up.email, 'Unknown') as activity_by
FROM ticket_activity_log tal
LEFT JOIN user_profiles up ON up.id = tal.created_by
WHERE tal.ticket_id = ANY(p_ticket_ids)
ORDER BY tal.ticket_id, tal.created_at DESC
),
note_stats AS (
SELECT
tn.ticket_id,
COUNT(*) as note_count,
BOOL_OR(
(tn.document_urls IS NOT NULL AND array_length(tn.document_urls, 1) > 0)
OR COALESCE(tn.has_voice_note, false)
OR COALESCE(tn.has_image, false)
) as has_attachments,
BOOL_OR(COALESCE(tn.has_image, false)) as has_images,
BOOL_OR(
tn.document_urls IS NOT NULL AND array_length(tn.document_urls, 1) > 0
) as has_documents,
(array_agg(tn.note_text ORDER BY tn.created_at DESC))[1] as last_note_text,
MAX(tn.created_at) as last_note_at
FROM ticket_notes tn
WHERE tn.ticket_id = ANY(p_ticket_ids)
GROUP BY tn.ticket_id
),
memo_stats AS (
SELECT
tm.ticket_id,
COUNT(*) as memo_count,
BOOL_OR(
(tm.document_urls IS NOT NULL AND array_length(tm.document_urls, 1) > 0)
OR COALESCE(tm.has_voice_note, false)
OR COALESCE(tm.has_image, false)
) as has_attachments,
BOOL_OR(COALESCE(tm.has_image, false)) as has_images,
BOOL_OR(
tm.document_urls IS NOT NULL AND array_length(tm.document_urls, 1) > 0
) as has_documents,
(array_agg(tm.memo_text ORDER BY tm.created_at DESC))[1] as last_memo_text,
MAX(tm.created_at) as last_memo_at
FROM ticket_memos tm
WHERE tm.ticket_id = ANY(p_ticket_ids)
GROUP BY tm.ticket_id
)
SELECT
tb.id as ticket_id,
tb.promise_date,
tb.promise_by_user_name,
tb.created_at as ticket_created_at,
tb.resolved_at as ticket_resolved_at,
tb.updated_at as ticket_updated_at,
lsc.description as last_status_change_status,
lsc.created_at as last_status_change_at,
lsc.changed_by as last_status_change_by,
la.description as last_activity_description,
la.created_at as last_activity_at,
la.activity_by as last_activity_by,
COALESCE(ns.note_count, 0) as note_count,
COALESCE(ns.has_attachments, false) as has_note_attachments,
COALESCE(ns.has_images, false) as has_note_images,
COALESCE(ns.has_documents, false) as has_note_documents,
ns.last_note_text,
ns.last_note_at,
COALESCE(ms.memo_count, 0) as memo_count,
COALESCE(ms.has_attachments, false) as has_memo_attachments,
COALESCE(ms.has_images, false) as has_memo_images,
COALESCE(ms.has_documents, false) as has_memo_documents,
ms.last_memo_text,
ms.last_memo_at
FROM ticket_base tb
LEFT JOIN last_status_changes lsc ON lsc.ticket_id = tb.id
LEFT JOIN last_activities la ON la.ticket_id = tb.id
LEFT JOIN note_stats ns ON ns.ticket_id = tb.id
LEFT JOIN memo_stats ms ON ms.ticket_id = tb.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ticket_enrichment_bulk TO authenticated;

NOTIFY pgrst, 'reload schema';

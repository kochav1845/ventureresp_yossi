/*
  # Collector Hub "Total Collected" was multiplied by the closed-ticket count
  # (audit finding 39)

  get_all_collectors_collection_summary() built two row sets per collector --
  collected_invoices (one row per paid invoice) and ticket_close_times (one row
  per closed ticket) -- LEFT JOINed both to all_collectors, and then took a
  plain SUM(ci.amount). That is a cartesian product: every invoice amount was
  counted once per closed ticket. The sibling aggregates escaped it only
  because they happened to use DISTINCT (COUNT(DISTINCT ci.invoice_ref),
  COUNT(DISTINCT tct.ticket_id)), and AVG survived because each value was
  replicated evenly.

  Reproduced on live data in a rolled-back transaction: give a collector with
  80 closed tickets credit for ONE fully-paid $1,000 invoice and the function
  returned total_collected = 80000.00 with invoices_paid_count = 1.

  It has not bitten yet only because the three collectors with collected
  invoices today all have closed_ticket_count = 0. It would have fired the
  first time anyone with closed tickets got credit for a payment -- i.e. as
  soon as the team starts closing the tickets they have just begun using. The
  figure drives the Collector Hub cards, "Avg per invoice", the team roll-up
  and the AI's collector-performance report, so payouts and rankings run off
  it.

  Fixed by pre-aggregating each metric to one row per collector in its own CTE
  and joining the scalars 1:1, which is what payment_counts already did.
*/

CREATE OR REPLACE FUNCTION public.get_all_collectors_collection_summary()
 RETURNS TABLE(collector_id uuid, total_collected numeric, invoices_paid_count bigint, payment_count bigint, avg_days_to_close numeric, closed_ticket_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
WITH all_collectors AS (
SELECT DISTINCT cid FROM (
SELECT assigned_collector_id AS cid FROM collection_tickets WHERE assigned_collector_id IS NOT NULL
UNION
SELECT assigned_collector_id AS cid FROM invoice_assignments WHERE assigned_collector_id IS NOT NULL
) x
),
collector_invoice_map AS (
SELECT DISTINCT ac_cid AS coll_id, invoice_ref FROM (
SELECT ct.assigned_collector_id AS ac_cid, ti.invoice_reference_number AS invoice_ref
FROM collection_tickets ct
JOIN ticket_invoices ti ON ti.ticket_id = ct.id
WHERE ct.assigned_collector_id IS NOT NULL

UNION

SELECT ia.assigned_collector_id AS ac_cid, ia.invoice_reference_number AS invoice_ref
FROM invoice_assignments ia
WHERE ia.assigned_collector_id IS NOT NULL
) mapping
),
collected_invoices AS (
SELECT
cim.coll_id,
cim.invoice_ref,
i.amount
FROM collector_invoice_map cim
JOIN acumatica_invoices i ON i.reference_number = cim.invoice_ref
WHERE i.balance = 0
),
payment_counts AS (
SELECT
cim.coll_id,
COUNT(DISTINCT pia.payment_reference_number) as pmt_count
FROM collector_invoice_map cim
JOIN payment_invoice_applications pia ON pia.invoice_reference_number = cim.invoice_ref
WHERE pia.amount_paid > 0
AND (pia.doc_type IS NULL OR pia.doc_type != 'Credit Memo')
GROUP BY cim.coll_id
),
ticket_close_times AS (
SELECT
ct.assigned_collector_id AS coll_id,
ct.id AS ticket_id,
EXTRACT(EPOCH FROM (COALESCE(ct.resolved_at, ct.updated_at) - ct.created_at)) / 86400.0 AS days_to_close
FROM collection_tickets ct
WHERE ct.status = 'closed'
AND ct.assigned_collector_id IS NOT NULL
),
-- Pre-aggregate each metric to one row per collector. The old final SELECT
-- joined collected_invoices (a row per paid invoice) to ticket_close_times (a
-- row per closed ticket) and then took a plain SUM(ci.amount), so every invoice
-- amount was counted once per closed ticket -- a collector with 80 closed
-- tickets showed 80x their real total. The sibling aggregates escaped it only
-- because they happened to use DISTINCT.
collected_totals AS (
SELECT coll_id,
       SUM(amount) AS total_collected,
       COUNT(DISTINCT invoice_ref) AS invoices_paid_count
FROM collected_invoices
GROUP BY coll_id
),
close_stats AS (
SELECT coll_id,
       AVG(days_to_close) AS avg_days_to_close,
       COUNT(DISTINCT ticket_id) AS closed_ticket_count
FROM ticket_close_times
GROUP BY coll_id
)
SELECT
ac.cid AS collector_id,
COALESCE(cot.total_collected, 0) AS total_collected,
COALESCE(cot.invoices_paid_count, 0) AS invoices_paid_count,
COALESCE(pc.pmt_count, 0) AS payment_count,
COALESCE(cs.avg_days_to_close, 0)::numeric AS avg_days_to_close,
COALESCE(cs.closed_ticket_count, 0) AS closed_ticket_count
FROM all_collectors ac
LEFT JOIN collected_totals cot ON cot.coll_id = ac.cid
LEFT JOIN payment_counts pc    ON pc.coll_id  = ac.cid
LEFT JOIN close_stats cs       ON cs.coll_id  = ac.cid
ORDER BY COALESCE(cot.total_collected, 0) DESC;
END;
$function$
;

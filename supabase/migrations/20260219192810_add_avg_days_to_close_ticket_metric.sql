/*
  # Add average days to close ticket metric to collector summary

  1. Changes
    - Added `avg_days_to_close` column to the `get_all_collectors_collection_summary` return type
    - Calculates average number of days between ticket creation and ticket closure
    - Uses `resolved_at` if available, otherwise falls back to `updated_at`
    - Only counts tickets with status = 'closed'

  2. Logic
    - For each collector, find all closed tickets
    - Calculate days between `created_at` and closure date (`resolved_at` or `updated_at`)
    - Return the average across all closed tickets
*/

DROP FUNCTION IF EXISTS get_all_collectors_collection_summary();

CREATE OR REPLACE FUNCTION get_all_collectors_collection_summary()
RETURNS TABLE (
  collector_id uuid,
  total_collected numeric,
  invoices_paid_count bigint,
  payment_count bigint,
  avg_days_to_close numeric,
  closed_ticket_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
)
SELECT
  ac.cid AS collector_id,
  COALESCE(SUM(ci.amount), 0) AS total_collected,
  COUNT(DISTINCT ci.invoice_ref) AS invoices_paid_count,
  COALESCE(MAX(pc.pmt_count), 0) AS payment_count,
  COALESCE(AVG(tct.days_to_close), 0)::numeric AS avg_days_to_close,
  COUNT(DISTINCT tct.ticket_id) AS closed_ticket_count
FROM all_collectors ac
LEFT JOIN collected_invoices ci ON ci.coll_id = ac.cid
LEFT JOIN payment_counts pc ON pc.coll_id = ac.cid
LEFT JOIN ticket_close_times tct ON tct.coll_id = ac.cid
GROUP BY ac.cid
ORDER BY COALESCE(SUM(ci.amount), 0) DESC;
END;
$$;

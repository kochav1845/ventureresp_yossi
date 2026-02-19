/*
  # Fix collector collection summary to use customer-level matching

  1. Changes
    - Updated `get_all_collectors_collection_summary` to match payments via 
      customer_id instead of invoice_reference_number
    - This correctly attributes ALL payments from assigned customers to the collector
    - Removed date filtering from the payment sum since Total Collected should 
      represent all-time collections for assigned customers
    - Collectors are identified via: collection_tickets, collector_customer_assignments, 
      and invoice_assignments

  2. Why This Fix
    - Previous version matched payments by invoice reference number with date filtering
    - This missed payments because many invoices aren't directly in invoice_assignments
    - Customer-level matching ensures all payments from a collector's assigned customers count
    - Matches the proven logic from the original CollectorActivityMonitor component
*/

DROP FUNCTION IF EXISTS get_all_collectors_collection_summary(date, date);

CREATE OR REPLACE FUNCTION get_all_collectors_collection_summary(
  p_start_date date DEFAULT '2000-01-01'::date,
  p_end_date date DEFAULT '2100-01-01'::date
)
RETURNS TABLE (
  collector_id uuid,
  total_collected numeric,
  invoices_paid_count bigint,
  payment_count bigint
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
    SELECT assigned_collector_id AS cid FROM collector_customer_assignments WHERE assigned_collector_id IS NOT NULL
    UNION
    SELECT assigned_collector_id AS cid FROM invoice_assignments WHERE assigned_collector_id IS NOT NULL
  ) x
),
collector_customer_map AS (
  SELECT DISTINCT ac_cid AS coll_id, cust_id FROM (
    SELECT ct.assigned_collector_id AS ac_cid, ct.customer_id AS cust_id
    FROM collection_tickets ct
    WHERE ct.assigned_collector_id IS NOT NULL

    UNION

    SELECT cca.assigned_collector_id AS ac_cid, cca.customer_id AS cust_id
    FROM collector_customer_assignments cca
    WHERE cca.assigned_collector_id IS NOT NULL

    UNION

    SELECT ia.assigned_collector_id AS ac_cid, i.customer AS cust_id
    FROM invoice_assignments ia
    JOIN acumatica_invoices i ON i.reference_number = ia.invoice_reference_number
    WHERE ia.assigned_collector_id IS NOT NULL
      AND i.customer IS NOT NULL
  ) mapping
),
payments AS (
  SELECT
    ccm.coll_id,
    pia.amount_paid,
    pia.invoice_reference_number,
    pia.payment_reference_number
  FROM payment_invoice_applications pia
  JOIN collector_customer_map ccm ON ccm.cust_id = pia.customer_id
  WHERE pia.amount_paid > 0
    AND (pia.doc_type IS NULL OR pia.doc_type != 'Credit Memo')
)
SELECT
  ac.cid AS collector_id,
  COALESCE(SUM(p.amount_paid), 0) AS total_collected,
  COUNT(DISTINCT p.invoice_reference_number) AS invoices_paid_count,
  COUNT(DISTINCT p.payment_reference_number) AS payment_count
FROM all_collectors ac
LEFT JOIN payments p ON p.coll_id = ac.cid
GROUP BY ac.cid
ORDER BY COALESCE(SUM(p.amount_paid), 0) DESC;
END;
$$;

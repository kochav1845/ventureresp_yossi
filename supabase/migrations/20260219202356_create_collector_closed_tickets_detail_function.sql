/*
  # Create function to get closed ticket details per collector

  1. New Functions
    - `get_collector_closed_tickets(p_collector_id uuid)`
      - Returns closed tickets assigned to a collector
      - Includes ticket number, created date, closed date
      - Includes invoice reference numbers and their original dates
      - Ordered by closed date descending

  2. Purpose
    - Provides admin visibility into which tickets each collector has closed
    - Shows the timeline from ticket creation to closure
    - Shows the original invoice dates associated with each ticket
*/

CREATE OR REPLACE FUNCTION get_collector_closed_tickets(p_collector_id uuid)
RETURNS TABLE (
  ticket_id uuid,
  ticket_number text,
  customer_name text,
  ticket_type text,
  priority text,
  created_at timestamptz,
  resolved_at timestamptz,
  days_to_close numeric,
  invoice_count bigint,
  invoices jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ct.id AS ticket_id,
    ct.ticket_number,
    ct.customer_name,
    ct.ticket_type,
    ct.priority,
    ct.created_at,
    ct.resolved_at,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(ct.resolved_at, ct.updated_at) - ct.created_at)) / 86400.0, 1) AS days_to_close,
    COUNT(ti.id) AS invoice_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'reference_number', ti.invoice_reference_number,
          'invoice_date', inv.date,
          'due_date', inv.due_date,
          'amount', inv.amount,
          'balance', inv.balance,
          'status', inv.status
        )
        ORDER BY inv.date ASC
      ) FILTER (WHERE ti.id IS NOT NULL),
      '[]'::jsonb
    ) AS invoices
  FROM collection_tickets ct
  LEFT JOIN ticket_invoices ti ON ti.ticket_id = ct.id
  LEFT JOIN acumatica_invoices inv ON inv.reference_number = ti.invoice_reference_number
  WHERE ct.assigned_collector_id = p_collector_id
    AND ct.status = 'closed'
  GROUP BY ct.id, ct.ticket_number, ct.customer_name, ct.ticket_type, ct.priority, ct.created_at, ct.resolved_at, ct.updated_at
  ORDER BY ct.resolved_at DESC NULLS LAST;
END;
$$;

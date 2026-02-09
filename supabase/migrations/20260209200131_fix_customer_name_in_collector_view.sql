/*
  # Fix Customer Name in Collector View

  1. Changes
    - Update `collector_assignment_details` view to use customer_name from collection_tickets table
    - Previously it was using customer_name from acumatica_invoices which could be missing
    - Now uses ticket customer_name as primary source, with invoice as fallback

  2. Impact
    - Tickets will now display the correct customer name that was selected during ticket creation
    - Ensures customer_name is always available even if invoice data is incomplete
*/

DROP VIEW IF EXISTS collector_assignment_details CASCADE;

CREATE VIEW collector_assignment_details AS
SELECT
  ia.id as assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes as assignment_notes,
  inv.customer,
  COALESCE(ct.customer_name, inv.customer_name) as customer_name,
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status as invoice_status,
  inv.description,
  inv.color_status,
  inv.promise_date as invoice_promise_date,
  ct.id as ticket_id_full,
  ct.ticket_number,
  ct.customer_id as ticket_customer_id,
  ct.status as ticket_status,
  ct.priority as ticket_priority,
  ct.ticket_type,
  ct.due_date as ticket_due_date,
  ct.promise_date as ticket_promise_date,
  up.full_name as collector_name,
  up.email as collector_email,
  creator.full_name as assigned_by_name,
  creator.email as assigned_by_email
FROM invoice_assignments ia
LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id
WHERE ct.id IS NULL OR ct.active = true;

GRANT SELECT ON collector_assignment_details TO authenticated;
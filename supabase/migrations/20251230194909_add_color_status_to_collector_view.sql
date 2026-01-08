/*
  # Add color_status to collector_assignment_details view

  1. Changes
    - Recreate collector_assignment_details view to include inv.color_status field
    - This allows collectors to see the invoice color status (green/orange/red) in their dashboard

  2. Security
    - View permissions remain unchanged
*/

DROP VIEW IF EXISTS collector_assignment_details;

CREATE OR REPLACE VIEW collector_assignment_details AS
SELECT
  ia.id as assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes as assignment_notes,
  inv.customer,
  inv.customer_name,
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status as invoice_status,
  inv.color_status,
  inv.description,
  ct.ticket_number,
  ct.status as ticket_status,
  ct.priority as ticket_priority,
  up.email as collector_email,
  creator.email as assigned_by_email
FROM invoice_assignments ia
LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id;

GRANT SELECT ON collector_assignment_details TO authenticated;

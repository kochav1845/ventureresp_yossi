/*
  # Add Promise Date Fields to Collector Assignment View

  ## Summary
  Updates the collector_assignment_details view to include promise_date and promise_by_user_id
  so that collectors can see broken promise indicators on their assignments.

  ## Changes
  1. Drop and recreate collector_assignment_details view
  2. Add promise_date and promise_by_user_id fields from acumatica_invoices

  ## Notes
  - These fields enable the "Broken Promise" feature in the collector dashboard
  - Allows collectors to track customers who didn't keep their payment promises
*/

-- Drop the existing view
DROP VIEW IF EXISTS collector_assignment_details;

-- Recreate the view with promise fields
CREATE VIEW collector_assignment_details AS
SELECT 
  ia.id AS assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes AS assignment_notes,
  inv.customer,
  inv.customer_name,
  inv.date AS invoice_date,
  inv.due_date,
  inv.amount,
  inv.balance AS invoice_balance,
  inv.status AS invoice_status,
  inv.color_status,
  inv.promise_date,
  inv.promise_by_user_id,
  inv.description,
  ct.ticket_number,
  ct.status AS ticket_status,
  ct.priority AS ticket_priority,
  ct.ticket_type,
  ct.created_at AS ticket_created_at,
  ct.assigned_at AS ticket_assigned_at,
  ct.assigned_by AS ticket_assigned_by,
  up.email AS collector_email,
  creator.email AS assigned_by_email,
  ticket_assigner.email AS ticket_assigned_by_email
FROM invoice_assignments ia
LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id
LEFT JOIN user_profiles ticket_assigner ON ct.assigned_by = ticket_assigner.id;

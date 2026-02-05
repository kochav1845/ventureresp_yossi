/*
  # Add Due Date to Collector Assignment View

  1. Changes
    - Add ticket_due_date column to collector_assignment_details view
    - This allows collectors to see when tickets are due
    
  2. Notes
    - Rebuilds the view to include the new field
*/

-- Drop the existing view
DROP VIEW IF EXISTS collector_assignment_details;

-- Recreate the view with ticket_due_date
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
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status AS invoice_status,
  inv.color_status,
  inv.description,
  ct.ticket_number,
  ct.status AS ticket_status,
  ct.priority AS ticket_priority,
  ct.ticket_type,
  ct.due_date AS ticket_due_date,
  ct.promise_date AS ticket_promise_date,
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

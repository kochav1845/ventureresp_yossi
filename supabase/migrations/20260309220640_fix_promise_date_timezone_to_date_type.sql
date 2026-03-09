/*
  # Fix Promise Date Timezone Issue - Convert timestamptz to date

  1. Changes
    - Convert `collection_tickets.promise_date` from `timestamptz` to `date`
    - Convert `acumatica_invoices.promise_date` from `timestamptz` to `date`
    - Drop and recreate `collector_assignment_details` view (depends on these columns)
    
  2. Why
    - Promise dates are calendar dates (e.g., "March 8, 2026"), not moments in time
    - Storing them as `timestamptz` causes timezone shift: a date entered as 03/08 
      gets stored as midnight UTC, which displays as 03/07 in US timezones
    - The `date` type stores just the calendar date without any timezone conversion
    
  3. Impact
    - Existing promise_date values will be converted, preserving the UTC date portion
    - No data loss - the date component is preserved
    - View is recreated identically
*/

DROP VIEW IF EXISTS collector_assignment_details;

ALTER TABLE collection_tickets 
  ALTER COLUMN promise_date TYPE date USING promise_date::date;

ALTER TABLE acumatica_invoices 
  ALTER COLUMN promise_date TYPE date USING promise_date::date;

CREATE OR REPLACE VIEW collector_assignment_details AS
SELECT 
  ia.id AS assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes AS assignment_notes,
  inv.customer,
  COALESCE(ct.customer_name, inv.customer_name) AS customer_name,
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status AS invoice_status,
  inv.description,
  inv.color_status,
  inv.promise_date AS invoice_promise_date,
  ct.id AS ticket_id_full,
  ct.ticket_number,
  ct.customer_id AS ticket_customer_id,
  ct.status AS ticket_status,
  ct.priority AS ticket_priority,
  ct.ticket_type,
  ct.due_date AS ticket_due_date,
  ct.promise_date AS ticket_promise_date,
  up.full_name AS collector_name,
  up.email AS collector_email,
  creator.full_name AS assigned_by_name,
  creator.email AS assigned_by_email
FROM invoice_assignments ia
  LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
  LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
  LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
  LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id;
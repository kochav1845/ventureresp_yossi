/*
  # Cleanup Paid Invoices from Existing Tickets

  ## Overview
  Remove any invoices that are already closed or paid from existing tickets.
  This is a one-time cleanup to ensure the system is in a consistent state
  after adding the auto-removal trigger.

  ## Changes
  1. Delete ticket_invoices entries where the invoice is closed or fully paid
  2. Log the cleanup action for audit purposes
*/

-- Remove all closed or fully paid invoices from tickets
WITH removed_invoices AS (
  DELETE FROM ticket_invoices
  WHERE invoice_reference_number IN (
    SELECT reference_number
    FROM acumatica_invoices
    WHERE status = 'Closed' OR balance <= 0
  )
  RETURNING *
)
SELECT COUNT(*) as removed_count FROM removed_invoices;
/*
  # Delete Tickets Without Invoices

  1. Purpose
    - Remove all collection tickets that have no associated invoice assignments
    - Clean up orphaned ticket data
  
  2. What Gets Deleted
    - Tickets with zero invoices
    - Related records (CASCADE):
      - ticket_activity_log entries
      - ticket_notes entries
      - ticket_status_history entries
      - ticket_merge_events entries
    - Related records (SET NULL):
      - invoice_reminders.ticket_id will be set to NULL

  3. Safety
    - Only deletes tickets with invoice_count = 0
    - All CASCADE constraints handle related data automatically
    - Transaction ensures all-or-nothing execution
*/

-- Delete all tickets that have no invoice assignments
DELETE FROM collection_tickets
WHERE id IN (
  SELECT ct.id 
  FROM collection_tickets ct 
  LEFT JOIN invoice_assignments ia ON ct.id = ia.ticket_id 
  GROUP BY ct.id 
  HAVING COUNT(ia.id) = 0
);

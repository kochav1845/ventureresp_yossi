/*
  # Delete Empty Tickets

  1. Purpose
    - Remove all tickets that don't have any invoices associated with them
    - This cleanup helps maintain data integrity and removes orphaned tickets

  2. Changes
    - Deletes all records from `collection_tickets` where no corresponding entries exist in `ticket_invoices`

  3. Safety
    - Uses LEFT JOIN to identify tickets without invoices
    - Only deletes tickets with zero invoice count
    - Does not affect tickets that have at least one invoice
*/

-- Delete all tickets that have no invoices
DELETE FROM collection_tickets
WHERE id IN (
  SELECT ct.id
  FROM collection_tickets ct
  LEFT JOIN ticket_invoices ti ON ct.id = ti.ticket_id
  WHERE ti.id IS NULL
);

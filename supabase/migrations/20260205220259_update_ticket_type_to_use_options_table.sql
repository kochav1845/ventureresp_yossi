/*
  # Update Ticket Type System to Use Options Table

  1. Changes
    - Remove CHECK constraint on collection_tickets.ticket_type
    - Allow any text value for ticket_type to support custom admin-defined types
    - Add index for faster filtering

  2. Notes
    - Existing ticket types remain valid
    - Admin can now create custom ticket types via ticket_type_options
    - The ticket_type column will reference values from ticket_type_options.value
*/

-- Remove the existing CHECK constraint on ticket_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'collection_tickets_ticket_type_check' 
    AND table_name = 'collection_tickets'
  ) THEN
    ALTER TABLE collection_tickets DROP CONSTRAINT collection_tickets_ticket_type_check;
  END IF;
END $$;

-- Add index for faster filtering by ticket_type
CREATE INDEX IF NOT EXISTS idx_collection_tickets_ticket_type_filter ON collection_tickets(ticket_type) WHERE active = true;

-- Update existing tickets with old 'chargeback' or 'settlement' types to match ticket_type_options
UPDATE collection_tickets 
SET ticket_type = 'chargeback'
WHERE ticket_type = 'chargeback' 
AND NOT EXISTS (SELECT 1 FROM ticket_type_options WHERE value = 'chargeback');

UPDATE collection_tickets 
SET ticket_type = 'settlement'
WHERE ticket_type = 'settlement'
AND NOT EXISTS (SELECT 1 FROM ticket_type_options WHERE value = 'settlement');

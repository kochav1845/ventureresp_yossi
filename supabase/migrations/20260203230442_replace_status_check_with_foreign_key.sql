/*
  # Replace Status Check Constraint with Foreign Key
  
  1. Changes
    - Remove hardcoded check constraint on collection_tickets.status
    - Add foreign key relationship to ticket_status_options.status_name
    - This allows any status that exists in ticket_status_options to be valid
  
  2. Why
    - Allows dynamic status management without migrations
    - Ensures referential integrity
    - Prevents orphaned status values
*/

-- Drop the old check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'collection_tickets_status_check' 
    AND table_name = 'collection_tickets'
  ) THEN
    ALTER TABLE collection_tickets DROP CONSTRAINT collection_tickets_status_check;
  END IF;
END $$;

-- Add foreign key to ticket_status_options
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'collection_tickets_status_fkey' 
    AND table_name = 'collection_tickets'
  ) THEN
    ALTER TABLE collection_tickets
    ADD CONSTRAINT collection_tickets_status_fkey
    FOREIGN KEY (status) REFERENCES ticket_status_options(status_name)
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Add index for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_collection_tickets_status 
ON collection_tickets(status);
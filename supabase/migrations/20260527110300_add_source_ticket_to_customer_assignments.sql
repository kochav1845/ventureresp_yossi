/*
  # Add source ticket reference to customer assignments

  1. Changes
    - Adds `source_ticket_id` column to `customer_assignments` to track which ticket triggered the assignment
    - Adds `source_ticket_number` for display purposes
    - These are optional - manual assignments won't have them

  2. Notes
    - No foreign key constraint since tickets may be deleted independently
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'source_ticket_id'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN source_ticket_id uuid DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'source_ticket_number'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN source_ticket_number text DEFAULT NULL;
  END IF;
END $$;

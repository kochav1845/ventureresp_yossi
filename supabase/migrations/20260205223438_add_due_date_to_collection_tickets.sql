/*
  # Add Due Date to Collection Tickets

  1. Changes
    - Add `due_date` column to collection_tickets table
    - This allows tracking when a ticket should be resolved by
    - Used to identify overdue tickets
    
  2. Notes
    - Due date is optional (can be null)
    - When set, tickets past this date are considered overdue
*/

-- Add due_date column to collection_tickets
ALTER TABLE collection_tickets 
ADD COLUMN IF NOT EXISTS due_date date;

-- Add index for filtering overdue tickets
CREATE INDEX IF NOT EXISTS idx_collection_tickets_due_date 
  ON collection_tickets(due_date) 
  WHERE due_date IS NOT NULL;

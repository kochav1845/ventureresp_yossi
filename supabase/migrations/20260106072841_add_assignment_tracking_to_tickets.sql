/*
  # Add Assignment Tracking to Collection Tickets

  1. Changes
    - Add `assigned_at` timestamp to track when ticket was assigned
    - Add `assigned_by` user reference to track who assigned the ticket
    - Update existing tickets to set initial assignment dates
  
  2. Notes
    - `assigned_at` will be automatically set when a collector is assigned
    - `assigned_by` tracks which admin/manager made the assignment
*/

-- Add new columns to collection_tickets
ALTER TABLE collection_tickets 
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES user_profiles(id);

-- For existing tickets with assignments, set assigned_at to created_at as initial value
UPDATE collection_tickets 
SET assigned_at = created_at 
WHERE assigned_collector_id IS NOT NULL AND assigned_at IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_collection_tickets_assigned_at ON collection_tickets(assigned_at);
CREATE INDEX IF NOT EXISTS idx_collection_tickets_assigned_by ON collection_tickets(assigned_by);

-- Add comment for documentation
COMMENT ON COLUMN collection_tickets.assigned_at IS 'Timestamp when the ticket was assigned to a collector';
COMMENT ON COLUMN collection_tickets.assigned_by IS 'User ID of the person who assigned the ticket';
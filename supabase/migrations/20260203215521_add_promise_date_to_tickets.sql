/*
  # Add Promise Date Tracking to Collection Tickets

  ## Summary
  Adds promise date tracking to collection tickets when customers commit to paying 
  off entire tickets by a certain date. This enables "Broken Promise" detection 
  and reminder functionality at the ticket level.

  ## Changes
  1. Add `promise_date` column to `collection_tickets` table
     - Tracks the date when customer promised to pay off the ticket
     - Nullable (only set when status = 'promised' and customer makes promise)
  
  2. Add `promise_by_user_id` column
     - Tracks which user/collector recorded the promise

  3. Add indexes for performance
     - Index on promise_date for quick overdue checking
     - Composite index on (status, promise_date) for broken promise queries

  ## Notes
  - When a ticket status is changed to "promised", the promise_date should be set
  - "Broken Promise" = status='promised' AND promise_date < NOW()
  - Reminders can be created based on promise_date
*/

-- Add promise tracking columns to collection_tickets
ALTER TABLE collection_tickets 
ADD COLUMN IF NOT EXISTS promise_date timestamptz,
ADD COLUMN IF NOT EXISTS promise_by_user_id uuid REFERENCES auth.users(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_promise_date 
  ON collection_tickets(promise_date) 
  WHERE promise_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_broken_promise 
  ON collection_tickets(status, promise_date) 
  WHERE status = 'promised' AND promise_date IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN collection_tickets.promise_date IS 
  'Date when customer promised to pay off ticket - used to track broken promises';
COMMENT ON COLUMN collection_tickets.promise_by_user_id IS 
  'User who recorded the payment promise';

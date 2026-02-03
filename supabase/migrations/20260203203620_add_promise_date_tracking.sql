/*
  # Add Promise Date Tracking for "Will Pay" Status

  ## Summary
  Adds promise date tracking to invoices when customers commit to paying by a certain date.
  This enables "Broken Promise" detection when promises are not kept.

  ## Changes
  1. Add `promise_date` column to `acumatica_invoices` table
     - Tracks the date when customer promised to pay
     - Nullable (only set when color_status = 'green' and customer makes promise)
  
  2. Add `promise_by_user_id` column
     - Tracks which user recorded the promise

  3. Add indexes for performance
     - Index on promise_date for quick overdue checking
     - Composite index on (color_status, promise_date) for broken promise queries

  ## Notes
  - When an invoice is marked as "Will Pay" (green), the promise_date should be set
  - "Broken Promise" = color_status='green' AND promise_date < NOW() AND balance > 0
*/

-- Add promise tracking columns
ALTER TABLE acumatica_invoices 
ADD COLUMN IF NOT EXISTS promise_date timestamptz,
ADD COLUMN IF NOT EXISTS promise_by_user_id uuid REFERENCES auth.users(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_promise_date 
  ON acumatica_invoices(promise_date) 
  WHERE promise_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_broken_promise 
  ON acumatica_invoices(color_status, promise_date) 
  WHERE color_status = 'green' AND promise_date IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN acumatica_invoices.promise_date IS 
  'Date when customer promised to pay - used to track broken promises';
COMMENT ON COLUMN acumatica_invoices.promise_by_user_id IS 
  'User who recorded the payment promise';

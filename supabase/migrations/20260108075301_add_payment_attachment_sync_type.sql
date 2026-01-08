/*
  # Add payment_attachment to sync_type constraint
  
  1. Changes
    - Expand sync_type check constraint to include 'payment_attachment'
    - This allows logging of attachment fetch operations
  
  2. Reason
    - The edge function tries to log attachments with sync_type='payment_attachment'
    - But the constraint only allowed 'payment_application', causing silent failures
*/

-- Drop the existing sync_type constraint
ALTER TABLE sync_change_logs 
DROP CONSTRAINT IF EXISTS sync_change_logs_sync_type_check;

-- Add updated constraint with payment_attachment included
ALTER TABLE sync_change_logs 
ADD CONSTRAINT sync_change_logs_sync_type_check 
CHECK (sync_type = ANY (ARRAY[
  'customer',
  'invoice',
  'payment',
  'payment_application',
  'payment_attachment'
]));

/*
  # Add Application Action Types to Sync Change Logs
  
  1. Changes
    - Expand the action_type check constraint to include application sync events
    - Adds: application_synced, application_sync_failed, application_sync_skipped
  
  2. Reason
    - Payment sync is trying to log application sync events but they're being rejected
    - This causes silent failures and no application sync logging
*/

-- Drop the existing constraint
ALTER TABLE sync_change_logs 
DROP CONSTRAINT IF EXISTS sync_change_logs_action_type_check;

-- Add updated constraint with application action types
ALTER TABLE sync_change_logs 
ADD CONSTRAINT sync_change_logs_action_type_check 
CHECK (action_type = ANY (ARRAY[
  'created',
  'updated', 
  'closed',
  'reopened',
  'deleted',
  'status_changed',
  'paid',
  'partially_paid',
  'application_synced',
  'application_sync_failed',
  'application_sync_skipped'
]));

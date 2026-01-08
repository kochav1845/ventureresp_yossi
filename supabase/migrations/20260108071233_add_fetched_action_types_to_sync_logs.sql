/*
  # Add Fetched Action Types to Sync Change Logs

  1. Changes
    - Expand action_type check constraint to include:
      - 'application_fetched' - when payment applications are fetched and synced
      - 'attachment_fetched' - when payment attachments/check images are fetched and synced
  
  2. Reason
    - Enhanced logging to track when applications and attachments are retrieved from Acumatica
    - Provides better visibility into data sync operations
    - Helps debug missing applications or attachments
*/

-- Drop the existing constraint
ALTER TABLE sync_change_logs 
DROP CONSTRAINT IF EXISTS sync_change_logs_action_type_check;

-- Add updated constraint with new fetched action types
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
  'application_sync_skipped',
  'application_fetched',
  'attachment_fetched'
]));

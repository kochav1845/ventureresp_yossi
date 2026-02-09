/*
  # Fix ticket activity log check constraint for priority changes

  1. Changes
    - Drop existing `ticket_activity_log_activity_type_check` constraint
    - Re-create it with `priority_changed` added to the allowed values

  2. Notes
    - The `update_ticket_priority` function logs `priority_changed` but the constraint was missing it
    - All other activity types remain unchanged
*/

ALTER TABLE ticket_activity_log
  DROP CONSTRAINT IF EXISTS ticket_activity_log_activity_type_check;

ALTER TABLE ticket_activity_log
  ADD CONSTRAINT ticket_activity_log_activity_type_check
  CHECK (activity_type IN (
    'note',
    'status_change',
    'assignment_change',
    'invoice_added',
    'invoice_removed',
    'created',
    'priority_changed'
  ));

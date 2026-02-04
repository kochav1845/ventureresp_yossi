/*
  # Fix Reminder Constraint to Use Title Instead of reminder_message

  1. Changes
    - Drop old check_reminder_has_message constraint
    - Add new constraint to check title field instead

  2. Reason
    - The table schema was updated to use 'title' and 'description' columns
    - Old constraint referenced non-existent 'reminder_message' column
*/

-- Drop the old constraint if it exists
ALTER TABLE invoice_reminders
DROP CONSTRAINT IF EXISTS check_reminder_has_message;

-- Add new constraint for title field
ALTER TABLE invoice_reminders
ADD CONSTRAINT check_reminder_has_title
CHECK (title IS NOT NULL AND LENGTH(TRIM(title)) > 0);

/*
  # Fix Invoice Reminders Schema

  1. Changes
    - Migrate any existing reminder_message data to title column
    - Drop the old reminder_message column
    - Make title column NOT NULL (required field)

  2. Reason
    - The codebase has been updated to use title/description structure
    - Old reminder_message column is causing NOT NULL constraint violations
    - Title should be a required field for better user experience
*/

-- First, migrate any existing data from reminder_message to title
UPDATE invoice_reminders
SET title = reminder_message
WHERE title IS NULL AND reminder_message IS NOT NULL;

-- Drop the old reminder_message column
ALTER TABLE invoice_reminders
DROP COLUMN IF EXISTS reminder_message;

-- Make title NOT NULL since it's now the required field
ALTER TABLE invoice_reminders
ALTER COLUMN title SET NOT NULL;

-- Add a helpful comment
COMMENT ON COLUMN invoice_reminders.title IS 'Required title/summary of the reminder';

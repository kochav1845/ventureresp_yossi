/*
  # Make invoice_id optional in invoice_reminders
  
  1. Changes
    - Remove NOT NULL constraint from invoice_id column
    - Allow reminders to be created without an invoice (general reminders)
    
  2. Reason
    - Users should be able to create reminders from the Reminders Portal
    - Not all reminders need to be associated with an invoice
*/

-- Make invoice_id nullable
ALTER TABLE invoice_reminders
ALTER COLUMN invoice_id DROP NOT NULL;

-- Add a check to ensure at least reminder_message exists
ALTER TABLE invoice_reminders
ADD CONSTRAINT check_reminder_has_message 
CHECK (reminder_message IS NOT NULL AND LENGTH(TRIM(reminder_message)) > 0);

COMMENT ON COLUMN invoice_reminders.invoice_id IS 'Optional reference to an invoice. Can be null for general reminders not tied to a specific invoice.';

/*
  # Enhance Invoice Reminders for Ticket Integration

  1. Changes
    - Add invoice_reference_number column for direct reference without FK
    - Add ticket_id column to link reminders to collection tickets
    - Add title column for brief reminder summary
    - Add description column for detailed notes
    - Add status column for tracking reminder state
    
  2. Reason
    - Support batch operations on tickets
    - Allow reminders to be associated with tickets
    - Provide more structured reminder information
    - Better integration with collection workflow
*/

-- Add new columns to invoice_reminders
ALTER TABLE invoice_reminders
ADD COLUMN IF NOT EXISTS invoice_reference_number text,
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES collection_tickets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'snoozed'));

-- Add index for ticket_id lookups
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_ticket_id ON invoice_reminders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_ref ON invoice_reminders(invoice_reference_number);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_status ON invoice_reminders(status);

-- Update send_email_notification default to true for better UX
ALTER TABLE invoice_reminders
ALTER COLUMN send_email_notification SET DEFAULT true;

COMMENT ON COLUMN invoice_reminders.invoice_reference_number IS 'Direct reference to invoice number, used when invoice_id FK is not needed';
COMMENT ON COLUMN invoice_reminders.ticket_id IS 'Optional reference to collection ticket';
COMMENT ON COLUMN invoice_reminders.title IS 'Brief summary of the reminder';
COMMENT ON COLUMN invoice_reminders.description IS 'Detailed description or notes for the reminder';
COMMENT ON COLUMN invoice_reminders.status IS 'Current status: pending, completed, cancelled, snoozed';
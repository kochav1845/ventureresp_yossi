/*
  # Add Message ID Column for Email Threading

  1. Changes
    - Add `message_id` column to `inbound_emails` to store the email's Message-ID header
    - This enables proper email threading by matching In-Reply-To and References headers
    - Add index for efficient lookups by message_id
  
  2. Purpose
    - Track email Message-ID headers to properly thread conversations
    - When a customer replies to an email, match it to the original thread using In-Reply-To
    - Provides more reliable threading than subject line matching alone
*/

-- Add message_id column to store email Message-ID header
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbound_emails' AND column_name = 'message_id'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN message_id text;
  END IF;
END $$;

-- Create index for efficient message_id lookups
CREATE INDEX IF NOT EXISTS idx_inbound_emails_message_id ON inbound_emails(message_id);

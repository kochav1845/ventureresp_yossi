/*
  # Add Conversation Threading to Emails

  1. Changes
    - Add `thread_id` column to `inbound_emails` to group related emails
    - Add `normalized_subject` column to help match conversation threads
    - Add `sent_at` column to `outbound_replies` for proper chronological ordering
    - Add indexes for efficient thread queries
  
  2. Purpose
    - Group emails by conversation thread based on subject line
    - Display email conversations like a chat with proper threading
    - Track both inbound and outbound messages in chronological order
*/

-- Add thread_id to inbound_emails (self-referencing to group conversations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbound_emails' AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN thread_id uuid REFERENCES inbound_emails(id);
  END IF;
END $$;

-- Add normalized_subject for thread matching (removes Re:, Fwd:, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inbound_emails' AND column_name = 'normalized_subject'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN normalized_subject text;
  END IF;
END $$;

-- Add sent_at to outbound_replies for chronological ordering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_replies' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE outbound_replies ADD COLUMN sent_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create indexes for efficient thread queries
CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread_id ON inbound_emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_normalized_subject ON inbound_emails(normalized_subject);
CREATE INDEX IF NOT EXISTS idx_outbound_replies_inbound_email_id ON outbound_replies(inbound_email_id);

-- Function to normalize email subjects (remove Re:, Fwd:, etc.)
CREATE OR REPLACE FUNCTION normalize_email_subject(subject text)
RETURNS text AS $$
BEGIN
  RETURN LOWER(TRIM(REGEXP_REPLACE(subject, '^(re:|fwd:|fw:)\s*', '', 'gi')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing emails with normalized subjects
UPDATE inbound_emails
SET normalized_subject = normalize_email_subject(subject)
WHERE normalized_subject IS NULL AND subject IS NOT NULL;
/*
  # Create outbound replies tracking table

  1. New Tables
    - `outbound_replies`
      - `id` (uuid, primary key)
      - `inbound_email_id` (uuid, foreign key to inbound_emails)
      - `sent_to` (text, recipient email address)
      - `subject` (text, email subject)
      - `body` (text, email body content)
      - `sent_by` (uuid, foreign key to auth.users)
      - `sent_at` (timestamptz, when the reply was sent)
      - `created_at` (timestamptz, record creation timestamp)

  2. Security
    - Enable RLS on `outbound_replies` table
    - Add policy for authenticated users to view all replies
    - Add policy for authenticated users to insert replies

  3. Indexes
    - Index on `inbound_email_id` for faster lookups
    - Index on `sent_by` for filtering by user
*/

CREATE TABLE IF NOT EXISTS outbound_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_email_id uuid REFERENCES inbound_emails(id) ON DELETE CASCADE,
  sent_to text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE outbound_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all replies"
  ON outbound_replies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert replies"
  ON outbound_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_outbound_replies_inbound_email 
  ON outbound_replies(inbound_email_id);

CREATE INDEX IF NOT EXISTS idx_outbound_replies_sent_by 
  ON outbound_replies(sent_by);
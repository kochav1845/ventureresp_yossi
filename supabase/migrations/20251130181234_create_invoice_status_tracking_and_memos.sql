/*
  # Invoice Status Tracking and Memo System

  1. New Tables
    - `invoice_status_history`
      - `id` (uuid, primary key)
      - `invoice_reference` (text) - The invoice number/reference
      - `customer_id` (text) - Customer reference
      - `old_status` (text) - Previous status
      - `new_status` (text) - New status (white/red/green/orange)
      - `changed_by` (uuid) - User who made the change
      - `changed_at` (timestamptz) - When the change was made
      - `notes` (text) - Optional notes about the change
      
    - `invoice_memos`
      - `id` (uuid, primary key)
      - `invoice_reference` (text) - The invoice number/reference
      - `customer_id` (text) - Customer reference
      - `user_id` (uuid) - User who created the memo
      - `memo_text` (text) - The memo content
      - `attachment_url` (text) - URL to attached file (screenshot, recording, etc)
      - `attachment_type` (text) - Type of attachment (image/audio/video/document)
      - `created_at` (timestamptz) - When memo was created
      
    - `invoice_current_status`
      - `invoice_reference` (text, primary key)
      - `customer_id` (text)
      - `status` (text) - Current status: white/red/green/orange
      - `last_updated_at` (timestamptz)
      - `last_updated_by` (uuid)
      
  2. Storage
    - Create storage bucket for memo attachments
    
  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage statuses
    - Add policies for viewing and creating memos
    - Admin gets full access to logs
*/

-- Create invoice_status_history table
CREATE TABLE IF NOT EXISTS invoice_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_reference text NOT NULL,
  customer_id text,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  notes text
);

-- Create invoice_memos table
CREATE TABLE IF NOT EXISTS invoice_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_reference text NOT NULL,
  customer_id text,
  user_id uuid REFERENCES auth.users(id),
  memo_text text,
  attachment_url text,
  attachment_type text,
  created_at timestamptz DEFAULT now()
);

-- Create invoice_current_status table
CREATE TABLE IF NOT EXISTS invoice_current_status (
  invoice_reference text PRIMARY KEY,
  customer_id text,
  status text DEFAULT 'white' NOT NULL,
  last_updated_at timestamptz DEFAULT now(),
  last_updated_by uuid REFERENCES auth.users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_status_history_invoice ON invoice_status_history(invoice_reference);
CREATE INDEX IF NOT EXISTS idx_status_history_user ON invoice_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_status_history_date ON invoice_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_invoice ON invoice_memos(invoice_reference);
CREATE INDEX IF NOT EXISTS idx_memos_user ON invoice_memos(user_id);
CREATE INDEX IF NOT EXISTS idx_memos_date ON invoice_memos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_current_status_status ON invoice_current_status(status);

-- Create storage bucket for memo attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-memos', 'invoice-memos', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE invoice_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_current_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoice_status_history
CREATE POLICY "Users can view status history"
  ON invoice_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert status history"
  ON invoice_status_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- RLS Policies for invoice_memos
CREATE POLICY "Users can view memos"
  ON invoice_memos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create memos"
  ON invoice_memos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memos"
  ON invoice_memos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memos"
  ON invoice_memos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for invoice_current_status
CREATE POLICY "Users can view invoice status"
  ON invoice_current_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert invoice status"
  ON invoice_current_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = last_updated_by);

CREATE POLICY "Users can update invoice status"
  ON invoice_current_status FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = last_updated_by);

-- Storage policies for memo attachments
CREATE POLICY "Users can upload memo attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoice-memos');

CREATE POLICY "Users can view memo attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoice-memos');

CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-memos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Function to automatically log status changes
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO invoice_status_history (
    invoice_reference,
    customer_id,
    old_status,
    new_status,
    changed_by
  ) VALUES (
    NEW.invoice_reference,
    NEW.customer_id,
    OLD.status,
    NEW.status,
    NEW.last_updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log status changes
DROP TRIGGER IF EXISTS on_status_change ON invoice_current_status;
CREATE TRIGGER on_status_change
  AFTER UPDATE ON invoice_current_status
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_status_change();

/*
  # Rebuild Invoice Memo System
  
  1. Changes
    - Drop and recreate invoice_memos table with clean structure
    - Remove problematic foreign key references
    - Add support for voice notes and pictures
    - Create storage bucket for attachments
    - Implement simple, working RLS policies
    
  2. New Structure
    - invoice_memos_v2 table with:
      - Basic memo information
      - Support for multiple attachment types (text, voice, image)
      - Direct user ID storage (no foreign key to avoid issues)
    
  3. Security
    - Simple RLS policies that actually work
    - Storage policies for file uploads
*/

-- Drop old table completely
DROP TABLE IF EXISTS invoice_memos CASCADE;

-- Create new memo table with clean structure
CREATE TABLE invoice_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  invoice_reference text NOT NULL,
  customer_id text,
  created_by_user_id uuid NOT NULL,
  created_by_user_email text,
  memo_text text,
  attachment_type text CHECK (attachment_type IN ('text', 'voice', 'image', 'mixed')),
  has_voice_note boolean DEFAULT false,
  has_image boolean DEFAULT false,
  voice_note_url text,
  voice_note_duration integer,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_invoice_memos_invoice_id ON invoice_memos(invoice_id);
CREATE INDEX idx_invoice_memos_created_by ON invoice_memos(created_by_user_id);
CREATE INDEX idx_invoice_memos_created_at ON invoice_memos(created_at DESC);

-- Enable RLS
ALTER TABLE invoice_memos ENABLE ROW LEVEL SECURITY;

-- Create simple, working policies
CREATE POLICY "authenticated_users_can_view_memos"
  ON invoice_memos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_users_can_insert_memos"
  ON invoice_memos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users_can_update_own_memos"
  ON invoice_memos
  FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "users_can_delete_own_memos"
  ON invoice_memos
  FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- Create storage bucket for memo attachments (voice notes and images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-memo-attachments',
  'invoice-memo-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for attachments
CREATE POLICY "authenticated_users_can_upload_attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoice-memo-attachments');

CREATE POLICY "authenticated_users_can_view_attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoice-memo-attachments');

CREATE POLICY "users_can_delete_own_attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-memo-attachments' 
    AND owner = auth.uid()
  );

-- Add helpful comments
COMMENT ON TABLE invoice_memos IS 'Stores user notes, voice recordings, and images for invoices';
COMMENT ON COLUMN invoice_memos.created_by_user_id IS 'User ID who created the memo - stored directly without foreign key';
COMMENT ON COLUMN invoice_memos.voice_note_url IS 'Storage path to voice recording';
COMMENT ON COLUMN invoice_memos.image_url IS 'Storage path to uploaded image';
COMMENT ON COLUMN invoice_memos.attachment_type IS 'Type of memo: text, voice, image, or mixed';

-- Force schema reload
NOTIFY pgrst, 'reload schema';

/*
  # Create Ticket Notes System

  1. New Tables
    - `ticket_notes`
      - `id` (uuid, primary key)
      - `ticket_id` (uuid, foreign key to collection_tickets)
      - `note_text` (text, nullable)
      - `has_voice_note` (boolean)
      - `has_image` (boolean)
      - `attachment_type` (text, nullable) - 'voice', 'image', 'document', or null
      - `document_urls` (text array) - for multiple document uploads
      - `created_by_user_id` (uuid, foreign key to user_profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Storage
    - Create bucket for ticket note attachments

  3. Security
    - Enable RLS on ticket_notes table
    - Add policies for authenticated users to manage their notes
    - Add storage policies for ticket note attachments

  4. Triggers
    - Auto-log ticket notes to ticket_activity_log
    - Auto-update updated_at timestamp
*/

-- Create ticket_notes table
CREATE TABLE IF NOT EXISTS ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  note_text text,
  has_voice_note boolean DEFAULT false,
  has_image boolean DEFAULT false,
  attachment_type text CHECK (attachment_type IN ('voice', 'image', 'document')),
  document_urls text[],
  created_by_user_id uuid NOT NULL REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket_id ON ticket_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_created_by ON ticket_notes(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_created_at ON ticket_notes(created_at DESC);

-- Enable RLS
ALTER TABLE ticket_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view ticket notes for their assigned tickets"
  ON ticket_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_notes.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can create notes on their assigned tickets"
  ON ticket_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM collection_tickets ct
        WHERE ct.id = ticket_id
        AND ct.assigned_collector_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "Users can update their own ticket notes"
  ON ticket_notes FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can delete their own ticket notes"
  ON ticket_notes FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- Create storage bucket for ticket note attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-note-attachments', 'ticket-note-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ticket note attachments
CREATE POLICY "Users can upload ticket note attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-note-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view ticket note attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ticket-note-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "Users can delete their own ticket note attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ticket-note-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Function to log ticket notes to activity log
CREATE OR REPLACE FUNCTION log_ticket_note_to_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_description text;
  v_attachment_info text := '';
  v_doc_count int;
BEGIN
  -- Build attachment description
  IF NEW.document_urls IS NOT NULL THEN
    v_doc_count := array_length(NEW.document_urls, 1);
    IF v_doc_count > 0 THEN
      v_attachment_info := ' (with ' || v_doc_count || ' document(s))';
    END IF;
  ELSIF NEW.has_voice_note THEN
    v_attachment_info := ' (with voice note)';
  ELSIF NEW.has_image THEN
    v_attachment_info := ' (with image)';
  END IF;

  -- Build description
  IF NEW.note_text IS NOT NULL AND NEW.note_text != '' THEN
    v_description := NEW.note_text || v_attachment_info;
  ELSE
    v_description := 'Note added' || v_attachment_info;
  END IF;

  -- Insert activity log
  INSERT INTO ticket_activity_log (
    ticket_id,
    activity_type,
    description,
    created_by,
    created_at,
    metadata
  ) VALUES (
    NEW.ticket_id,
    'note',
    v_description,
    NEW.created_by_user_id,
    NEW.created_at,
    jsonb_build_object(
      'note_id', NEW.id,
      'has_voice_note', NEW.has_voice_note,
      'has_image', NEW.has_image,
      'attachment_type', NEW.attachment_type,
      'document_count', COALESCE(array_length(NEW.document_urls, 1), 0)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log ticket notes
DROP TRIGGER IF EXISTS trigger_log_ticket_note ON ticket_notes;
CREATE TRIGGER trigger_log_ticket_note
  AFTER INSERT ON ticket_notes
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_note_to_activity();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ticket_note_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ticket_note_timestamp ON ticket_notes;
CREATE TRIGGER trigger_update_ticket_note_timestamp
  BEFORE UPDATE ON ticket_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_note_timestamp();

/*
  # Add Email Folders and Advanced Search System

  ## Overview
  This migration transforms the inbox into a Gmail-like system with folders, labels, and advanced search capabilities.

  ## Changes

  ### 1. Add folder column to inbound_emails
  - `folder` (text) - Stores email folder location: 'inbox', 'spam', 'archive', 'trash', 'sent'
  - Default is 'inbox'
  - Add index for efficient folder filtering

  ### 2. Add starred and important flags
  - `is_starred` (boolean) - User-marked as starred/important
  - `is_important` (boolean) - System-marked as important based on criteria

  ### 3. Create email_labels table
  - Users can create custom labels like in Gmail
  - Many-to-many relationship with emails
  - `id` (uuid, primary key)
  - `name` (text) - Label name
  - `color` (text) - Label color for UI
  - `created_by` (uuid) - Admin who created it
  - `created_at` (timestamptz)

  ### 4. Create email_label_assignments table
  - Links emails to labels
  - `email_id` (uuid) - Foreign key to inbound_emails
  - `label_id` (uuid) - Foreign key to email_labels
  - Composite primary key

  ### 5. Add full-text search support
  - Add tsvector column for full-text search
  - Create GIN index for fast search
  - Trigger to auto-update search vector

  ### 6. Add deleted_at for soft deletes
  - `deleted_at` (timestamptz) - When moved to trash
  - Emails in trash for 30+ days can be permanently deleted

  ## Security
  - RLS policies updated to respect folder visibility
  - Labels are per-admin, only visible to creator or all admins
  - Trash items only visible if deleted_at is not null

  ## Indexes
  - Index on folder for filtering
  - Index on is_starred, is_important
  - GIN index on search_vector for full-text search
  - Index on deleted_at for trash management
*/

-- Add new columns to inbound_emails
DO $$
BEGIN
  -- Add folder column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inbound_emails' AND column_name = 'folder'
  ) THEN
    ALTER TABLE inbound_emails 
    ADD COLUMN folder text NOT NULL DEFAULT 'inbox' 
    CHECK (folder IN ('inbox', 'spam', 'archive', 'trash', 'sent'));
  END IF;

  -- Add is_starred column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inbound_emails' AND column_name = 'is_starred'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN is_starred boolean DEFAULT false;
  END IF;

  -- Add is_important column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inbound_emails' AND column_name = 'is_important'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN is_important boolean DEFAULT false;
  END IF;

  -- Add deleted_at column for soft deletes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inbound_emails' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN deleted_at timestamptz;
  END IF;

  -- Add search_vector column for full-text search
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inbound_emails' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE inbound_emails ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Create email_labels table
CREATE TABLE IF NOT EXISTS email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  created_by uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(name, created_by)
);

-- Create email_label_assignments table
CREATE TABLE IF NOT EXISTS email_label_assignments (
  email_id uuid NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES email_labels(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (email_id, label_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inbound_emails_folder ON inbound_emails(folder);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_is_starred ON inbound_emails(is_starred);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_is_important ON inbound_emails(is_important);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_deleted_at ON inbound_emails(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_search_vector ON inbound_emails USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_email_labels_created_by ON email_labels(created_by);
CREATE INDEX IF NOT EXISTS idx_email_label_assignments_email_id ON email_label_assignments(email_id);
CREATE INDEX IF NOT EXISTS idx_email_label_assignments_label_id ON email_label_assignments(label_id);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_email_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sender_email, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS trigger_update_email_search_vector ON inbound_emails;
CREATE TRIGGER trigger_update_email_search_vector
  BEFORE INSERT OR UPDATE OF subject, body, sender_email
  ON inbound_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_email_search_vector();

-- Update existing emails to populate search_vector
UPDATE inbound_emails
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(body, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(sender_email, '')), 'C')
WHERE search_vector IS NULL;

-- Enable RLS on new tables
ALTER TABLE email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_label_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_labels
CREATE POLICY "Admins can view all labels"
  ON email_labels FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can create labels"
  ON email_labels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins can update their own labels"
  ON email_labels FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can delete their own labels"
  ON email_labels FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for email_label_assignments
CREATE POLICY "Admins can view all label assignments"
  ON email_label_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can create label assignments"
  ON email_label_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete label assignments"
  ON email_label_assignments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create function to search emails with full-text search
CREATE OR REPLACE FUNCTION search_emails(
  search_query text,
  folder_filter text DEFAULT 'inbox',
  has_attachments boolean DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  sender_email text,
  subject text,
  body text,
  received_at timestamptz,
  processing_status text,
  is_read boolean,
  folder text,
  is_starred boolean,
  is_important boolean,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.customer_id,
    e.sender_email,
    e.subject,
    e.body,
    e.received_at,
    e.processing_status,
    e.is_read,
    e.folder,
    e.is_starred,
    e.is_important,
    ts_rank(e.search_vector, websearch_to_tsquery('english', search_query)) AS rank
  FROM inbound_emails e
  WHERE 
    (search_query IS NULL OR search_query = '' OR e.search_vector @@ websearch_to_tsquery('english', search_query))
    AND (folder_filter = 'all' OR e.folder = folder_filter)
    AND (has_attachments IS NULL OR 
         (has_attachments = true AND EXISTS (SELECT 1 FROM customer_files WHERE customer_files.inbound_email_id = e.id)) OR
         (has_attachments = false AND NOT EXISTS (SELECT 1 FROM customer_files WHERE customer_files.inbound_email_id = e.id))
    )
    AND (date_from IS NULL OR e.received_at >= date_from)
    AND (date_to IS NULL OR e.received_at <= date_to)
    AND e.deleted_at IS NULL
  ORDER BY 
    CASE WHEN search_query IS NOT NULL AND search_query != '' 
    THEN ts_rank(e.search_vector, websearch_to_tsquery('english', search_query)) 
    ELSE 0 END DESC,
    e.received_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_emails(text, text, boolean, timestamptz, timestamptz) TO authenticated;

-- Create function to move email to folder
CREATE OR REPLACE FUNCTION move_email_to_folder(
  email_id uuid,
  target_folder text
)
RETURNS void AS $$
BEGIN
  UPDATE inbound_emails
  SET 
    folder = target_folder,
    deleted_at = CASE WHEN target_folder = 'trash' THEN now() ELSE NULL END
  WHERE id = email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION move_email_to_folder(uuid, text) TO authenticated;

-- Create function to permanently delete emails in trash older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_trash_emails()
RETURNS void AS $$
BEGIN
  DELETE FROM inbound_emails
  WHERE folder = 'trash'
    AND deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_trash_emails() TO authenticated;

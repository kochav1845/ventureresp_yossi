/*
  # Add Comprehensive Reminder and Memo System

  ## Summary
  Adds remaining tables for the comprehensive reminder system including attachments,
  activity logs, reminders, and notifications.

  ## New Tables

  ### `invoice_memo_attachments`
  - Stores file attachments (voice notes, screenshots) for memos
  
  ### `invoice_activity_log`
  - Tracks all changes to invoices (color status changes, memo additions)
  
  ### `invoice_reminders`
  - Stores scheduled reminders for invoices
  
  ### `user_reminder_notifications`
  - Stores pending notifications for users

  ## Updates
  - Add invoice_id column to invoice_memos for better referencing
  - Create storage bucket for attachments
  - Add all necessary indexes

  ## Security
  - Enable RLS on all new tables
  - Appropriate policies for authenticated users
*/

-- Add invoice_id to invoice_memos if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_memos' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE invoice_memos ADD COLUMN invoice_id uuid REFERENCES acumatica_invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing invoice_memos to populate invoice_id
UPDATE invoice_memos
SET invoice_id = (
  SELECT id FROM acumatica_invoices
  WHERE reference_number = invoice_memos.invoice_reference
)
WHERE invoice_id IS NULL;

-- Create invoice_memo_attachments table
CREATE TABLE IF NOT EXISTS invoice_memo_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id uuid NOT NULL REFERENCES invoice_memos(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create invoice_activity_log table
CREATE TABLE IF NOT EXISTS invoice_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  old_value text,
  new_value text,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create invoice_reminders table
CREATE TABLE IF NOT EXISTS invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_date timestamptz NOT NULL,
  reminder_message text NOT NULL,
  is_triggered boolean DEFAULT false,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_reminder_notifications table
CREATE TABLE IF NOT EXISTS user_reminder_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id uuid NOT NULL REFERENCES invoice_reminders(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create storage bucket for invoice memo attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-memo-attachments', 'invoice-memo-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE invoice_memo_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminder_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoice_memo_attachments
CREATE POLICY "Authenticated users can view attachments"
  ON invoice_memo_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_memos
      WHERE invoice_memos.id = invoice_memo_attachments.memo_id
    )
  );

CREATE POLICY "Users can create attachments for their memos"
  ON invoice_memo_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_memos
      WHERE invoice_memos.id = memo_id
      AND invoice_memos.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete attachments from their memos"
  ON invoice_memo_attachments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_memos
      WHERE invoice_memos.id = memo_id
      AND invoice_memos.user_id = auth.uid()
    )
  );

-- RLS Policies for invoice_activity_log
CREATE POLICY "Authenticated users can view activity logs"
  ON invoice_activity_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create activity logs"
  ON invoice_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for invoice_reminders
CREATE POLICY "Users can view their own reminders"
  ON invoice_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
  ON invoice_reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
  ON invoice_reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
  ON invoice_reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_reminder_notifications
CREATE POLICY "Users can view their own notifications"
  ON user_reminder_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
  ON user_reminder_notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON user_reminder_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage policies for invoice-memo-attachments bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' 
    AND policyname = 'Authenticated users can upload memo attachments'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can upload memo attachments"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = ''invoice-memo-attachments'')';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' 
    AND policyname = 'Authenticated users can view memo attachments'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can view memo attachments"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = ''invoice-memo-attachments'')';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' 
    AND policyname = 'Users can delete their own memo attachments'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete their own memo attachments"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = ''invoice-memo-attachments'')';
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoice_memos_invoice_id ON invoice_memos(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_invoice_id ON invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_user_id ON invoice_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_reminder_date ON invoice_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_triggered ON invoice_reminders(is_triggered);
CREATE INDEX IF NOT EXISTS idx_user_reminder_notifications_user_id ON user_reminder_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reminder_notifications_is_read ON user_reminder_notifications(is_read);

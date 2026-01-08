/*
  # Inbound Email Response Processing and File Management System

  ## Overview
  This migration creates a comprehensive system for receiving and processing customer email responses,
  storing file attachments, and organizing files by customer and month.

  ## New Tables

  ### 1. `inbound_emails`
  Stores all received emails from customers with complete metadata
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers, nullable) - Matched customer or NULL if not found
  - `sender_email` (text) - Email address of sender
  - `subject` (text) - Email subject line
  - `body` (text) - Email body content
  - `received_at` (timestamptz) - When email was received
  - `processing_status` (text) - Status: 'pending', 'processed', 'manual_review', 'customer_not_found'
  - `is_read` (boolean) - Whether secretary has viewed this email
  - `raw_data` (jsonb) - Complete webhook payload for reference
  - `created_at` (timestamptz)

  ### 2. `email_analysis`
  Stores AI analysis results of email content and automated actions taken
  - `id` (uuid, primary key)
  - `inbound_email_id` (uuid, foreign key to inbound_emails)
  - `detected_intent` (text) - Intent: 'file_attached', 'postpone', 'stop', 'general', 'unclear'
  - `confidence_score` (numeric) - Confidence level 0.0 to 1.0
  - `keywords_found` (text[]) - Array of detected keywords
  - `action_taken` (text) - Action: 'marked_responded', 'paused_emails', 'deactivated_customer', 'none'
  - `processed_by_admin` (uuid, foreign key to user_profiles, nullable) - If manually reviewed
  - `notes` (text) - Additional notes or manual review comments
  - `created_at` (timestamptz)

  ### 3. `customer_files`
  Stores uploaded file metadata organized by customer and month
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers)
  - `inbound_email_id` (uuid, foreign key to inbound_emails, nullable) - Source email if from email
  - `month` (integer) - Month number 1-12
  - `year` (integer) - Year (e.g., 2025)
  - `filename` (text) - Original filename
  - `storage_path` (text) - Path in Supabase Storage
  - `file_size` (bigint) - File size in bytes
  - `mime_type` (text) - File MIME type
  - `upload_source` (text) - Source: 'email', 'manual_admin', 'manual_customer'
  - `uploaded_by` (uuid, foreign key to user_profiles, nullable) - User who uploaded if manual
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. `email_notifications`
  Tracks which emails have been viewed by admins for notification purposes
  - `id` (uuid, primary key)
  - `inbound_email_id` (uuid, foreign key to inbound_emails)
  - `admin_id` (uuid, foreign key to user_profiles)
  - `viewed_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - Enable Row Level Security (RLS) on all tables
  - Admin users can perform all operations
  - Customer users can view only their own files and upload their own files
  - Service role can insert inbound emails (for webhook)

  ## Indexes
  - Index on customer_id, received_at for efficient inbox queries
  - Index on month and year for file lookups
  - Index on processing_status and is_read for filtering
*/

-- Create inbound_emails table
CREATE TABLE IF NOT EXISTS inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sender_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'manual_review', 'customer_not_found')),
  is_read boolean DEFAULT false,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create email_analysis table
CREATE TABLE IF NOT EXISTS email_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_email_id uuid NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
  detected_intent text NOT NULL DEFAULT 'unclear' CHECK (detected_intent IN ('file_attached', 'postpone', 'stop', 'general', 'unclear')),
  confidence_score numeric(3,2) DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  keywords_found text[] DEFAULT ARRAY[]::text[],
  action_taken text NOT NULL DEFAULT 'none' CHECK (action_taken IN ('marked_responded', 'paused_emails', 'deactivated_customer', 'none', 'manual_override')),
  processed_by_admin uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create customer_files table
CREATE TABLE IF NOT EXISTS customer_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  inbound_email_id uuid REFERENCES inbound_emails(id) ON DELETE SET NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint DEFAULT 0,
  mime_type text DEFAULT 'application/octet-stream',
  upload_source text NOT NULL DEFAULT 'email' CHECK (upload_source IN ('email', 'manual_admin', 'manual_customer')),
  uploaded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create email_notifications table
CREATE TABLE IF NOT EXISTS email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_email_id uuid NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(inbound_email_id, admin_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_inbound_emails_customer_id ON inbound_emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_received_at ON inbound_emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_processing_status ON inbound_emails(processing_status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_is_read ON inbound_emails(is_read);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_sender_email ON inbound_emails(sender_email);

CREATE INDEX IF NOT EXISTS idx_email_analysis_inbound_email_id ON email_analysis(inbound_email_id);
CREATE INDEX IF NOT EXISTS idx_email_analysis_detected_intent ON email_analysis(detected_intent);

CREATE INDEX IF NOT EXISTS idx_customer_files_customer_id ON customer_files(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_files_month_year ON customer_files(month, year);
CREATE INDEX IF NOT EXISTS idx_customer_files_customer_month_year ON customer_files(customer_id, year, month);

CREATE INDEX IF NOT EXISTS idx_email_notifications_admin_id ON email_notifications(admin_id);

-- Enable RLS on all tables
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inbound_emails

CREATE POLICY "Admins can view all inbound emails"
  ON inbound_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert inbound emails"
  ON inbound_emails FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can update inbound emails"
  ON inbound_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete inbound emails"
  ON inbound_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for email_analysis

CREATE POLICY "Admins can view all email analysis"
  ON email_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert email analysis"
  ON email_analysis FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can insert email analysis"
  ON email_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update email analysis"
  ON email_analysis FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for customer_files

CREATE POLICY "Admins can view all customer files"
  ON customer_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Customers can view their own files"
  ON customer_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = customer_files.customer_id
      AND customers.email = (
        SELECT email FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can insert customer files"
  ON customer_files FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can insert customer files"
  ON customer_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Customers can insert their own files"
  ON customer_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = customer_files.customer_id
      AND customers.email = (
        SELECT email FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can update customer files"
  ON customer_files FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete customer files"
  ON customer_files FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for email_notifications

CREATE POLICY "Admins can view their own notifications"
  ON email_notifications FOR SELECT
  TO authenticated
  USING (
    admin_id = auth.uid()
  );

CREATE POLICY "Admins can insert their own notifications"
  ON email_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
  );

-- Create trigger for updated_at on customer_files
DROP TRIGGER IF EXISTS update_customer_files_updated_at ON customer_files;
CREATE TRIGGER update_customer_files_updated_at
  BEFORE UPDATE ON customer_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a function to get unread email count for admins
CREATE OR REPLACE FUNCTION get_unread_email_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM inbound_emails
    WHERE is_read = false
  );
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_unread_email_count() TO authenticated;

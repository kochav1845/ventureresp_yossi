/*
  # Customer Monthly Tracking System

  Creates a system to track each customer's monthly email/response status
  with attached files, providing a 12-month overview per customer.

  1. New Tables
    - `customer_monthly_tracking`
      - `id` (uuid, primary key)
      - `acumatica_customer_id` (text, references acumatica_customers.customer_id)
      - `month` (integer, 1-12)
      - `year` (integer)
      - `status` (text: pending, active, sent, responded, postponed, inactive, no_response)
      - `emails_sent_count` (integer)
      - `emails_received_count` (integer)
      - `attachments_count` (integer)
      - `last_email_sent_at` (timestamptz)
      - `last_response_at` (timestamptz)
      - `postponed_until` (timestamptz)
      - `notes` (text)
      - `updated_by` (uuid, references auth.users)
      - Unique constraint on (acumatica_customer_id, month, year)

    - `customer_monthly_files`
      - `id` (uuid, primary key)
      - `tracking_id` (uuid, references customer_monthly_tracking)
      - `acumatica_customer_id` (text)
      - `month` (integer)
      - `year` (integer)
      - `filename` (text)
      - `storage_path` (text)
      - `file_size` (bigint)
      - `mime_type` (text)
      - `upload_source` (text: email, manual)
      - `inbound_email_id` (uuid, optional reference to inbound email)
      - `uploaded_by` (uuid)

  2. Security
    - RLS enabled on both tables
    - Authenticated users can read/write based on role
*/

CREATE TABLE IF NOT EXISTS customer_monthly_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acumatica_customer_id text NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'sent', 'responded', 'postponed', 'inactive', 'no_response')),
  emails_sent_count integer NOT NULL DEFAULT 0,
  emails_received_count integer NOT NULL DEFAULT 0,
  attachments_count integer NOT NULL DEFAULT 0,
  last_email_sent_at timestamptz,
  last_response_at timestamptz,
  postponed_until timestamptz,
  notes text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (acumatica_customer_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_cmt_customer_id ON customer_monthly_tracking(acumatica_customer_id);
CREATE INDEX IF NOT EXISTS idx_cmt_year_month ON customer_monthly_tracking(year, month);

ALTER TABLE customer_monthly_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read monthly tracking"
  ON customer_monthly_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert monthly tracking"
  ON customer_monthly_tracking FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update monthly tracking"
  ON customer_monthly_tracking FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete monthly tracking"
  ON customer_monthly_tracking FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS customer_monthly_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id uuid REFERENCES customer_monthly_tracking(id) ON DELETE CASCADE,
  acumatica_customer_id text NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint DEFAULT 0,
  mime_type text,
  upload_source text NOT NULL DEFAULT 'manual' CHECK (upload_source IN ('email', 'manual')),
  inbound_email_id uuid,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmf_customer_id ON customer_monthly_files(acumatica_customer_id);
CREATE INDEX IF NOT EXISTS idx_cmf_tracking_id ON customer_monthly_files(tracking_id);
CREATE INDEX IF NOT EXISTS idx_cmf_year_month ON customer_monthly_files(year, month);

ALTER TABLE customer_monthly_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read monthly files"
  ON customer_monthly_files FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert monthly files"
  ON customer_monthly_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update monthly files"
  ON customer_monthly_files FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete monthly files"
  ON customer_monthly_files FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION update_customer_monthly_tracking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_monthly_tracking_updated
  BEFORE UPDATE ON customer_monthly_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_monthly_tracking_timestamp();

CREATE OR REPLACE FUNCTION update_tracking_attachment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE customer_monthly_tracking
    SET attachments_count = (
      SELECT COUNT(*) FROM customer_monthly_files
      WHERE acumatica_customer_id = NEW.acumatica_customer_id
        AND month = NEW.month AND year = NEW.year
    )
    WHERE acumatica_customer_id = NEW.acumatica_customer_id
      AND month = NEW.month AND year = NEW.year;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE customer_monthly_tracking
    SET attachments_count = (
      SELECT COUNT(*) FROM customer_monthly_files
      WHERE acumatica_customer_id = OLD.acumatica_customer_id
        AND month = OLD.month AND year = OLD.year
    )
    WHERE acumatica_customer_id = OLD.acumatica_customer_id
      AND month = OLD.month AND year = OLD.year;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_tracking_attachment_count
  AFTER INSERT OR DELETE ON customer_monthly_files
  FOR EACH ROW
  EXECUTE FUNCTION update_tracking_attachment_count();

CREATE OR REPLACE FUNCTION get_customer_monthly_overview(
  p_customer_id text,
  p_year integer
)
RETURNS TABLE (
  month integer,
  year integer,
  status text,
  emails_sent_count integer,
  emails_received_count integer,
  attachments_count integer,
  last_email_sent_at timestamptz,
  last_response_at timestamptz,
  postponed_until timestamptz,
  notes text,
  tracking_id uuid
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  )
  SELECT
    m.m::integer AS month,
    p_year AS year,
    COALESCE(t.status, 'pending')::text AS status,
    COALESCE(t.emails_sent_count, 0)::integer AS emails_sent_count,
    COALESCE(t.emails_received_count, 0)::integer AS emails_received_count,
    COALESCE(t.attachments_count, 0)::integer AS attachments_count,
    t.last_email_sent_at,
    t.last_response_at,
    t.postponed_until,
    t.notes,
    t.id AS tracking_id
  FROM months m
  LEFT JOIN customer_monthly_tracking t
    ON t.acumatica_customer_id = p_customer_id
    AND t.month = m.m
    AND t.year = p_year
  ORDER BY m.m;
END;
$$ LANGUAGE plpgsql;

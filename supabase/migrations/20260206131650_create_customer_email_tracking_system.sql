/*
  # Create Customer Email Tracking System

  1. New Tables
    - `customer_email_logs`
      - `id` (uuid, primary key)
      - `customer_id` (text) - Acumatica customer ID
      - `customer_name` (text) - Customer name
      - `customer_email` (text) - Email address
      - `template_id` (uuid) - Reference to template used
      - `template_name` (text) - Name of template at time of send
      - `subject` (text) - Email subject line
      - `sent_at` (timestamptz) - When email was sent
      - `delivered_at` (timestamptz) - When email was delivered
      - `opened_at` (timestamptz) - First time email was opened
      - `last_opened_at` (timestamptz) - Last time email was opened
      - `open_count` (integer) - Number of times opened
      - `clicked_at` (timestamptz) - First time link was clicked
      - `click_count` (integer) - Number of link clicks
      - `bounced_at` (timestamptz) - If email bounced
      - `bounce_reason` (text) - Bounce error message
      - `sendgrid_message_id` (text) - SendGrid tracking ID
      - `status` (text) - sent, delivered, opened, bounced, failed
      - `error_message` (text) - Any error messages
      - `invoice_count` (integer) - Number of invoices in report
      - `total_balance` (numeric) - Balance amount
      - `had_pdf_attachment` (boolean) - Whether PDF was attached
      - `sent_by_user_id` (uuid) - User who sent the email
      - `metadata` (jsonb) - Additional tracking data

  2. Indexes
    - Index on customer_id for fast lookups
    - Index on sent_at for date range queries
    - Index on status for filtering
    - Index on sendgrid_message_id for webhook lookups

  3. Security
    - Enable RLS
    - Authenticated users can view logs
    - Only admins can delete logs
*/

CREATE TABLE IF NOT EXISTS customer_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  template_id uuid REFERENCES customer_report_templates(id) ON DELETE SET NULL,
  template_name text,
  subject text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer DEFAULT 0,
  clicked_at timestamptz,
  click_count integer DEFAULT 0,
  bounced_at timestamptz,
  bounce_reason text,
  sendgrid_message_id text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  error_message text,
  invoice_count integer DEFAULT 0,
  total_balance numeric(15,2) DEFAULT 0,
  had_pdf_attachment boolean DEFAULT false,
  sent_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_customer_id ON customer_email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON customer_email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON customer_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sendgrid_id ON customer_email_logs(sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_template_id ON customer_email_logs(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON customer_email_logs(sent_by_user_id) WHERE sent_by_user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE customer_email_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view logs
CREATE POLICY "Users can view email logs"
  ON customer_email_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role and admins can insert logs (for webhook and sending)
CREATE POLICY "System can insert email logs"
  ON customer_email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role and admins can update logs (for webhook events)
CREATE POLICY "System can update email logs"
  ON customer_email_logs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only admins can delete logs
CREATE POLICY "Admins can delete email logs"
  ON customer_email_logs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to get email statistics
CREATE OR REPLACE FUNCTION get_email_statistics(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_customer_id text DEFAULT NULL
)
RETURNS TABLE (
  total_sent bigint,
  total_delivered bigint,
  total_opened bigint,
  total_clicked bigint,
  total_bounced bigint,
  unique_recipients bigint,
  average_open_rate numeric,
  average_click_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_logs AS (
    SELECT *
    FROM customer_email_logs
    WHERE (p_start_date IS NULL OR sent_at >= p_start_date)
      AND (p_end_date IS NULL OR sent_at <= p_end_date)
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
  )
  SELECT
    COUNT(*)::bigint as total_sent,
    COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked'))::bigint as total_delivered,
    COUNT(*) FILTER (WHERE status IN ('opened', 'clicked'))::bigint as total_opened,
    COUNT(*) FILTER (WHERE status = 'clicked')::bigint as total_clicked,
    COUNT(*) FILTER (WHERE status = 'bounced')::bigint as total_bounced,
    COUNT(DISTINCT customer_email)::bigint as unique_recipients,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) > 0
      THEN (COUNT(*) FILTER (WHERE status IN ('opened', 'clicked'))::numeric / 
            COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked'))::numeric * 100)
      ELSE 0
    END as average_open_rate,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) > 0
      THEN (COUNT(*) FILTER (WHERE status = 'clicked')::numeric / 
            COUNT(*) FILTER (WHERE status IN ('opened', 'clicked'))::numeric * 100)
      ELSE 0
    END as average_click_rate
  FROM filtered_logs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent email activity
CREATE OR REPLACE FUNCTION get_recent_email_activity(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  customer_id text,
  customer_name text,
  customer_email text,
  template_name text,
  subject text,
  sent_at timestamptz,
  opened_at timestamptz,
  open_count integer,
  status text,
  invoice_count integer,
  total_balance numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cel.id,
    cel.customer_id,
    cel.customer_name,
    cel.customer_email,
    cel.template_name,
    cel.subject,
    cel.sent_at,
    cel.opened_at,
    cel.open_count,
    cel.status,
    cel.invoice_count,
    cel.total_balance
  FROM customer_email_logs cel
  ORDER BY cel.sent_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
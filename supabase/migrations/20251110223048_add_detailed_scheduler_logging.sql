/*
  # Add Detailed Scheduler Logging System

  ## Summary
  This migration adds comprehensive logging to track exactly which emails are being sent by the scheduler,
  including detailed recipient lists, execution statistics, and enhanced email log tracking.

  ## New Tables

  ### 1. `scheduler_execution_logs`
  Stores detailed information about each scheduler execution run
  - `id` (uuid, primary key)
  - `execution_id` (uuid) - Unique identifier for this execution run
  - `executed_at` (timestamptz) - When the scheduler ran
  - `execution_time_ms` (integer) - How long the execution took
  - `total_assignments_checked` (integer) - Total active assignments evaluated
  - `emails_queued` (integer) - Number of emails queued for sending
  - `emails_sent` (integer) - Number successfully sent
  - `emails_failed` (integer) - Number that failed
  - `test_mode` (boolean) - Whether running in test mode
  - `detailed_recipients` (jsonb) - Array of recipient details with status
  - `skipped_customers` (jsonb) - Array of customers skipped with reasons
  - `error_summary` (text) - Any errors encountered
  - `created_at` (timestamptz)

  ## Table Modifications

  ### `email_logs` enhancements
  - Add `sendgrid_message_id` column to track SendGrid's unique identifier
  - Add `processing_timestamp` column to record when scheduler processed the email
  - Add `skipped_reason` column to track why emails were not sent
  - Add indexes for better query performance

  ## Security
  - Enable RLS on scheduler_execution_logs table
  - Only admins can view scheduler execution logs
  - Service role can insert logs (for scheduler function)

  ## Important Notes
  - This enables full visibility into which customers receive emails
  - Helps debug issues where emails aren't reaching all intended recipients
  - Provides audit trail for email sending operations
*/

-- Create scheduler_execution_logs table
CREATE TABLE IF NOT EXISTS scheduler_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL DEFAULT gen_random_uuid(),
  executed_at timestamptz DEFAULT now(),
  execution_time_ms integer,
  total_assignments_checked integer DEFAULT 0,
  emails_queued integer DEFAULT 0,
  emails_sent integer DEFAULT 0,
  emails_failed integer DEFAULT 0,
  test_mode boolean DEFAULT false,
  detailed_recipients jsonb DEFAULT '[]'::jsonb,
  skipped_customers jsonb DEFAULT '[]'::jsonb,
  error_summary text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on scheduler_execution_logs
ALTER TABLE scheduler_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy for scheduler_execution_logs - admins can view
CREATE POLICY "Admins can view scheduler execution logs"
  ON scheduler_execution_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Allow service role to insert (for the scheduler function)
CREATE POLICY "Service role can insert scheduler execution logs"
  ON scheduler_execution_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create indexes for scheduler_execution_logs
CREATE INDEX IF NOT EXISTS idx_scheduler_execution_logs_executed_at ON scheduler_execution_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_execution_logs_execution_id ON scheduler_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_execution_logs_test_mode ON scheduler_execution_logs(test_mode);

-- Add new columns to email_logs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'sendgrid_message_id'
  ) THEN
    ALTER TABLE email_logs ADD COLUMN sendgrid_message_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'processing_timestamp'
  ) THEN
    ALTER TABLE email_logs ADD COLUMN processing_timestamp timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'skipped_reason'
  ) THEN
    ALTER TABLE email_logs ADD COLUMN skipped_reason text;
  END IF;
END $$;

-- Create additional indexes on email_logs for better performance
CREATE INDEX IF NOT EXISTS idx_email_logs_sendgrid_message_id ON email_logs(sendgrid_message_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_processing_timestamp ON email_logs(processing_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_customer_email ON email_logs(customer_id, sent_at DESC);

-- Update the invoke_email_scheduler function to capture detailed response data
CREATE OR REPLACE FUNCTION invoke_email_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  supabase_key text;
  request_result http_response;
  start_time timestamptz;
  end_time timestamptz;
  execution_ms integer;
  response_json jsonb;
BEGIN
  start_time := clock_timestamp();
  
  -- Get Supabase URL from current request
  supabase_url := current_setting('request.header.host', true);
  IF supabase_url IS NOT NULL THEN
    supabase_url := 'https://' || supabase_url;
  ELSE
    -- Fallback: construct from project reference
    supabase_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://' || current_database() || '.supabase.co'
    );
  END IF;
  
  -- Get service role key (needs to be configured)
  supabase_key := current_setting('app.settings.supabase_service_key', true);
  
  -- Make HTTP request to edge function
  BEGIN
    request_result := http((
      'POST',
      supabase_url || '/functions/v1/email-scheduler',
      ARRAY[
        http_header('Authorization', 'Bearer ' || COALESCE(supabase_key, '')),
        http_header('Content-Type', 'application/json')
      ],
      'application/json',
      '{}'
    )::http_request);
    
    end_time := clock_timestamp();
    execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Parse response JSON
    BEGIN
      response_json := request_result.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
      response_json := jsonb_build_object('raw_response', request_result.content);
    END;
    
    -- Log successful execution with enhanced data
    INSERT INTO cron_job_logs (job_name, status, response_data, execution_time_ms)
    VALUES (
      'email-scheduler',
      'success',
      response_json,
      execution_ms
    );
    
  EXCEPTION WHEN OTHERS THEN
    end_time := clock_timestamp();
    execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Log failed execution
    INSERT INTO cron_job_logs (job_name, status, error_message, execution_time_ms)
    VALUES (
      'email-scheduler',
      'failed',
      SQLERRM,
      execution_ms
    );
  END;
END;
$$;

-- Create helper function to get recent scheduler executions with details
CREATE OR REPLACE FUNCTION get_recent_scheduler_executions(limit_count integer DEFAULT 20)
RETURNS TABLE (
  execution_id uuid,
  executed_at timestamptz,
  execution_time_ms integer,
  emails_sent integer,
  emails_failed integer,
  test_mode boolean,
  recipients_sent jsonb,
  recipients_failed jsonb,
  skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sel.execution_id,
    sel.executed_at,
    sel.execution_time_ms,
    sel.emails_sent,
    sel.emails_failed,
    sel.test_mode,
    (
      SELECT jsonb_agg(r)
      FROM jsonb_array_elements(sel.detailed_recipients) r
      WHERE r->>'status' = 'sent'
    ) AS recipients_sent,
    (
      SELECT jsonb_agg(r)
      FROM jsonb_array_elements(sel.detailed_recipients) r
      WHERE r->>'status' = 'failed'
    ) AS recipients_failed,
    jsonb_array_length(sel.skipped_customers) AS skipped_count
  FROM scheduler_execution_logs sel
  ORDER BY sel.executed_at DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission on helper function
GRANT EXECUTE ON FUNCTION get_recent_scheduler_executions(integer) TO authenticated;
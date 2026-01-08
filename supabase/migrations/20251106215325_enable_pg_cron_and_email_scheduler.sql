/*
  # Enable pg_cron Extension and Configure Email Scheduler

  ## Overview
  Sets up automated email scheduling using PostgreSQL's pg_cron extension to invoke the email-scheduler edge function every minute.

  ## Changes
  1. Extensions
    - Enable `pg_cron` extension for scheduled job execution
    - Enable `http` extension for making HTTP requests to edge functions

  2. Database Function
    - Create `invoke_email_scheduler()` function that calls the edge function via HTTP
    - Includes error handling and logging

  3. Cron Job Configuration
    - Schedule job to run every minute
    - Job invokes the email scheduler function

  4. Monitoring Table
    - Create `cron_job_logs` table to track execution history
    - Store execution time, status, and response data

  ## Security
  - Enable RLS on cron_job_logs table
  - Only admins can view cron logs
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Create cron job logs table for monitoring
CREATE TABLE IF NOT EXISTS cron_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  executed_at timestamptz DEFAULT now(),
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  response_data jsonb,
  error_message text,
  execution_time_ms integer
);

-- Enable RLS on cron_job_logs
ALTER TABLE cron_job_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy for cron_job_logs
CREATE POLICY "Admins can view cron logs"
  ON cron_job_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create indexes for cron_job_logs
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_executed_at ON cron_job_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_status ON cron_job_logs(status);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name ON cron_job_logs(job_name);

-- Create function to invoke the email scheduler edge function
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
    
    -- Log successful execution
    INSERT INTO cron_job_logs (job_name, status, response_data, execution_time_ms)
    VALUES (
      'email-scheduler',
      'success',
      request_result.content::jsonb,
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

-- Remove existing cron job if it exists (safe check)
DO $$
BEGIN
  PERFORM cron.unschedule('email-scheduler-job');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Schedule new job to run every minute
SELECT cron.schedule(
  'email-scheduler-job',
  '* * * * *',  -- Every minute
  $$SELECT invoke_email_scheduler();$$
);

-- Create a helper function to manually trigger the scheduler (for testing)
CREATE OR REPLACE FUNCTION trigger_email_scheduler_manually()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM invoke_email_scheduler();
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Email scheduler triggered manually',
    'timestamp', now()
  );
END;
$$;

-- Grant execute permission on the manual trigger function
GRANT EXECUTE ON FUNCTION trigger_email_scheduler_manually() TO authenticated;
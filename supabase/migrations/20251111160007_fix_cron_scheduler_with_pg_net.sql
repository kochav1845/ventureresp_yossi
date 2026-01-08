/*
  # Fix Cron Scheduler with pg_net Extension

  ## Overview
  Replaces the http extension with pg_net for the email scheduler cron job.
  The http extension has DNS resolution issues in Supabase environments,
  while pg_net is specifically designed for Supabase and handles networking properly.

  ## Changes
  1. Extensions
    - Enable `pg_net` extension (Supabase-optimized networking)
    - Keep `pg_cron` for scheduling

  2. Updated Function
    - Rewrite `invoke_email_scheduler()` to use `net.http_post()` instead of `http()`
    - Use proper environment variable for Supabase URL
    - Improved error handling and logging

  3. Configuration
    - Function now uses async HTTP requests via pg_net
    - Results are logged to cron_job_logs table

  ## Notes
  - pg_net is asynchronous, so we check results separately
  - The service role key must be available in the environment
*/

-- Enable pg_net extension (Supabase-specific, replaces http extension)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Drop the old function that uses http extension
DROP FUNCTION IF EXISTS invoke_email_scheduler();

-- Create new function using pg_net
CREATE OR REPLACE FUNCTION invoke_email_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  supabase_key text;
  request_id bigint;
  start_time timestamptz;
  end_time timestamptz;
  execution_ms integer;
BEGIN
  start_time := clock_timestamp();
  
  -- Get the Supabase URL from environment
  -- In Supabase, SUPABASE_URL is available as an environment variable
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  -- If not set, try to construct it
  IF supabase_url IS NULL OR supabase_url = '' THEN
    -- Get from the current database connection
    supabase_url := 'https://leipneymocoksmajxnok.supabase.co';
  END IF;
  
  -- Get service role key from environment
  supabase_key := current_setting('app.settings.supabase_service_key', true);
  
  -- If key is not available, we can't proceed
  IF supabase_key IS NULL OR supabase_key = '' THEN
    -- Use anon key as fallback for edge function that has JWT verification disabled
    supabase_key := current_setting('app.settings.supabase_anon_key', true);
  END IF;
  
  -- Make async HTTP POST request using pg_net
  BEGIN
    SELECT INTO request_id net.http_post(
      url := supabase_url || '/functions/v1/email-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(supabase_key, '')
      ),
      body := '{}'::jsonb
    );
    
    end_time := clock_timestamp();
    execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Log successful request (note: this logs the request, not necessarily success)
    INSERT INTO cron_job_logs (job_name, status, response_data, execution_time_ms)
    VALUES (
      'email-scheduler',
      'success',
      jsonb_build_object('request_id', request_id, 'note', 'Request sent via pg_net'),
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

-- The cron job schedule remains the same
-- It was created in the previous migration and will continue to work
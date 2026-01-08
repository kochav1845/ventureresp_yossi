/*
  # Simplify Cron Job to Use Direct HTTP Call

  ## Overview
  Updates the cron job to make a simple HTTP call to the edge function without requiring service role key configuration.

  ## Changes
  - Simplify the invoke function to use anon key instead of service role
  - Use hardcoded project URL
  - Add better error logging
*/

-- Update the function to use a simpler approach
CREATE OR REPLACE FUNCTION invoke_email_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_result http_response;
  start_time timestamptz;
  end_time timestamptz;
  execution_ms integer;
  project_url text;
  anon_key text;
BEGIN
  start_time := clock_timestamp();
  
  -- Use the actual project URL
  project_url := 'https://leipneymocoksmajxnok.supabase.co';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlaXBuZXltb2Nva3NtYWp4bm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDc0MzMsImV4cCI6MjA3ODAyMzQzM30.yKMRxFrEIQa9IGOZnGqa_2b0VUB_naEsCsy6R6S_jCA';
  
  BEGIN
    -- Make HTTP POST request to the edge function
    request_result := http_post(
      project_url || '/functions/v1/email-scheduler',
      '{}',
      'application/json',
      ARRAY[
        http_header('Authorization', 'Bearer ' || anon_key),
        http_header('Content-Type', 'application/json')
      ]
    );
    
    end_time := clock_timestamp();
    execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Check if request was successful (2xx status code)
    IF request_result.status >= 200 AND request_result.status < 300 THEN
      -- Log successful execution
      INSERT INTO cron_job_logs (job_name, status, response_data, execution_time_ms)
      VALUES (
        'email-scheduler',
        'success',
        request_result.content::jsonb,
        execution_ms
      );
    ELSE
      -- Log failed execution with status code
      INSERT INTO cron_job_logs (job_name, status, error_message, execution_time_ms)
      VALUES (
        'email-scheduler',
        'failed',
        'HTTP ' || request_result.status || ': ' || request_result.content,
        execution_ms
      );
    END IF;
    
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
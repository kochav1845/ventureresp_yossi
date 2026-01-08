/*
  # Fix Cron Job URL Resolution

  ## Overview
  Updates the invoke_email_scheduler function to correctly resolve the Supabase URL and service role key.

  ## Changes
  - Fix URL construction to use the actual Supabase project URL
  - Use proper environment variable access for service role key
  - Add better error handling and logging
*/

-- Drop and recreate the function with proper URL handling
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
  
  -- Construct Supabase URL from the actual project reference
  -- The current_setting for request.jwt.claims can give us the issuer URL
  BEGIN
    SELECT (current_setting('request.jwt.claims', true)::json->>'iss')
    INTO supabase_url;
  EXCEPTION
    WHEN OTHERS THEN
      -- Fallback: use hardcoded URL (replace with your actual URL)
      supabase_url := 'https://leipneymocoksmajxnok.supabase.co';
  END;
  
  -- Remove trailing slash if present
  supabase_url := rtrim(supabase_url, '/');
  
  -- Get service role key from app settings
  -- This should be configured in Supabase project settings
  BEGIN
    supabase_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      supabase_key := NULL;
  END;
  
  -- If key is still null, try alternative method
  IF supabase_key IS NULL THEN
    BEGIN
      supabase_key := current_setting('supabase.service_role_key', true);
    EXCEPTION
      WHEN OTHERS THEN
        supabase_key := NULL;
    END;
  END IF;
  
  -- Make HTTP request to edge function
  BEGIN
    IF supabase_key IS NULL OR supabase_url IS NULL THEN
      RAISE EXCEPTION 'Supabase URL or service key not configured. URL: %, Key: %', 
        COALESCE(supabase_url, 'NULL'), 
        CASE WHEN supabase_key IS NULL THEN 'NULL' ELSE 'SET' END;
    END IF;

    request_result := http((
      'POST',
      supabase_url || '/functions/v1/email-scheduler',
      ARRAY[
        http_header('Authorization', 'Bearer ' || supabase_key),
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
    
    -- Log failed execution with detailed error
    INSERT INTO cron_job_logs (job_name, status, error_message, execution_time_ms)
    VALUES (
      'email-scheduler',
      'failed',
      SQLERRM || ' (URL: ' || COALESCE(supabase_url, 'NULL') || ')',
      execution_ms
    );
  END;
END;
$$;
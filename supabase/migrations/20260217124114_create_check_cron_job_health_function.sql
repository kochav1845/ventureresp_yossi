/*
  # Create Cron Job Health Check Function

  Creates a function to check if the main sync cron job has run in the last 15 minutes.
  
  1. Function
    - `check_cron_job_health()` - Returns boolean indicating if cron job is healthy
    - Queries cron.job_run_details to find the last run of acumatica-auto-sync
    - Returns true if the job ran within the last 15 minutes, false otherwise
  
  2. Security
    - Function is SECURITY DEFINER to allow querying cron schema
    - Only accessible to authenticated users
*/

-- Create function to check cron job health
CREATE OR REPLACE FUNCTION check_cron_job_health()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_run_time timestamptz;
  v_fifteen_minutes_ago timestamptz;
BEGIN
  -- Get the last run time of the acumatica-auto-sync job
  SELECT r.start_time INTO v_last_run_time
  FROM cron.job_run_details r
  JOIN cron.job j ON r.jobid = j.jobid
  WHERE j.jobname = 'acumatica-auto-sync'
  ORDER BY r.start_time DESC
  LIMIT 1;

  -- If no run found, return false
  IF v_last_run_time IS NULL THEN
    RETURN false;
  END IF;

  -- Calculate 15 minutes ago
  v_fifteen_minutes_ago := NOW() - INTERVAL '15 minutes';

  -- Return true if last run was within 15 minutes
  RETURN v_last_run_time > v_fifteen_minutes_ago;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_cron_job_health() TO authenticated;

-- Add comment
COMMENT ON FUNCTION check_cron_job_health() IS 'Checks if the acumatica-auto-sync cron job has run in the last 15 minutes';
